#!/usr/bin/env node
/**
 * Downloads the flight-fare-history dataset (CC-BY-4.0) and generates
 * supabase/seed/country_fare_refs.sql:
 *   1. country_fare_refs        — country-level OBSERVED one-way references
 *                                 aggregated from matched city routes.
 *   2. derived_round_trip_refs  — sums of two directional one-way MEDIANS,
 *                                 labelled derived, never observed returns.
 *   3. fare_mapping_review      — every dataset city name that could not be
 *                                 mapped to exactly one country.
 *
 * The worldwide country-pair matrix itself is NOT materialised as rows: it is
 * enumerated on demand from the countries table by generateCountryPairs()
 * (src/lib/fare-history.ts) — rows here only exist where real observations
 * support them, plus one needs_research marker per airport-served pair.
 *
 * Honesty invariants enforced while generating:
 *  - original EUR preserved, no currency conversion at import;
 *  - ambiguous/unmatched city names go to the review queue, never guessed;
 *  - domestic city routes never create international pair rows;
 *  - derived values carry their method label and both source routes;
 *  - an import refresh NEVER overwrites admin review decisions.
 *
 * Run: node scripts/load-fare-history.mjs [path-to-routes.csv]
 * (downloads when the file is missing)
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROUTES_URL = "https://huggingface.co/datasets/DeusHorizon/flight-fare-history/resolve/main/routes.csv";
const OUT = "supabase/seed/country_fare_refs.sql";
const DATA_DIR = "supabase/data/flight-fare-history";
const ROUTES_FILE = `${DATA_DIR}/routes.csv`;

// ---------------------------------------------------------------------------
// 1. Minimal CSV line parser (quoted fields, escaped quotes — dataset is simple)
// ---------------------------------------------------------------------------
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function numOrNull(s, { min = null } = {}) {
  if (s === null || s === undefined || s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (min !== null && n < min) return null; // negative/absurd fares rejected
  return n;
}

function esc(s) {
  return s === null || s === undefined || s === "" ? "null" : `'${String(s).replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// 2. Airport seed parser — reuse the generated airports.sql as the geocode
//    source so the city→country index matches the live airport directory.
// ---------------------------------------------------------------------------
function loadAirportCityIndex() {
  const sql = readFileSync("supabase/seed/airports.sql", "utf8");
  const rows = [];
  // Values tuples: (ident, source_ident, iata, icao, name, muni, iso, region, lat, lon, ...)
  const re = /\(\s*'([^']*)',\s*'([^']*)',\s*(?:'([A-Z0-9]{3})'|null),\s*(?:'([A-Z0-9]{4})'|null),\s*'((?:[^']|'')*)',\s*(null|'(?:[^']|'')*'),\s*'([A-Z]{2})'/g;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const muni = m[6] === "null" ? null : m[6].replace(/''/g, "'");
    rows.push({ city: muni, isoCountry: m[7] });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 3. City normalisation + alias reduction — MUST match src/lib/fare-history.ts
// (kept in sync by fare-history-parity unit test)
// ---------------------------------------------------------------------------
function normalizeCityName(raw) {
  let s = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[’‘`´]/g, "'").toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  return s;
}

const CITY_ALIAS_RULES = [
  { suffix: / city$/, replacement: "" },
  { suffix: / islands?$/, replacement: "" },
  { suffix: / new$/, replacement: "" },
];

function cityAliases(raw) {
  const base = normalizeCityName(raw);
  const out = new Set([base]);
  for (const rule of CITY_ALIAS_RULES) {
    if (rule.suffix.test(base)) out.add(base.replace(rule.suffix, "").trim());
  }
  return [...out].filter((s) => s.length >= 2);
}

function buildCityCountryIndex(rows) {
  const byCity = new Map();
  let airports = 0;
  for (const r of rows) {
    if (!r.city) continue;
    const iso = r.isoCountry.toUpperCase();
    if (!/^[A-Z]{2}$/.test(iso)) continue;
    airports++;
    for (const key of cityAliases(r.city)) {
      let countries = byCity.get(key);
      if (!countries) { countries = new Map(); byCity.set(key, countries); }
      countries.set(iso, (countries.get(iso) ?? 0) + 1);
    }
  }
  return { byCity, airports };
}

function matchCityToCountries(index, datasetCity) {
  const aliases = cityAliases(datasetCity);
  const merged = new Map();
  let matchedAny = false;
  for (const key of aliases) {
    const countries = index.byCity.get(key);
    if (!countries) continue;
    matchedAny = true;
    for (const [iso, n] of countries) merged.set(iso, (merged.get(iso) ?? 0) + n);
  }
  if (!matchedAny) return { kind: "unmatched", countries: [] };
  const sorted = [...merged.keys()].sort();
  return sorted.length === 1 ? { kind: "unique", countries: sorted } : { kind: "ambiguous", countries: sorted };
}

// ---------------------------------------------------------------------------
// 4. Aggregation (mirrors aggregateCountryPairRefs / deriveRoundTrips)
// ---------------------------------------------------------------------------
function aggregateCountryPairRefs(matched) {
  const byPair = new Map();
  for (const r of matched) {
    if (r.originIso === r.destinationIso) continue;
    const key = `${r.originIso}>${r.destinationIso}`;
    const list = byPair.get(key);
    if (list) list.push(r); else byPair.set(key, [r]);
  }
  const refs = [];
  for (const [key, routes] of byPair) {
    const [originIso, destinationIso] = key.split(">");
    let best = null;
    let totalObs = 0;
    let first = "9999-12-31";
    let last = "0000-01-01";
    for (const r of routes) {
      totalObs += r.observations;
      if (r.firstObserved < first) first = r.firstObserved;
      if (r.lastObserved > last) last = r.lastObserved;
      if (!best || r.minEur < best.minEur) best = r;
    }
    if (!best) continue;
    refs.push({
      originIso, destinationIso,
      lowestObservedEur: best.minEur,
      lowestCityPair: `${best.originCity} → ${best.destinationCity}`,
      medianOfContributingRouteEur: best.medianEur,
      observation_count: totalObs,
      totalObservations: totalObs,
      firstObserved: first, lastObserved: last,
      cityRouteCount: routes.length,
    });
  }
  return refs;
}

function deriveRoundTrips(refs) {
  const byKey = new Map();
  for (const r of refs) byKey.set(`${r.originIso}>${r.destinationIso}`, r);
  const out = [];
  for (const r of refs) {
    const reverse = byKey.get(`${r.destinationIso}>${r.originIso}`);
    if (!reverse) continue;
    if (`${r.originIso}>${r.destinationIso}` >= `${r.destinationIso}>${r.originIso}`) continue;
    out.push({
      originIso: r.originIso, destinationIso: r.destinationIso,
      derivedEur: Math.round((r.medianOfContributingRouteEur + reverse.medianOfContributingRouteEur) * 100) / 100,
      outboundMedianEur: r.medianOfContributingRouteEur,
      inboundMedianEur: reverse.medianOfContributingRouteEur,
      outboundLastObserved: r.lastObserved,
      inboundLastObserved: reverse.lastObserved,
      outboundCityPair: r.lowestCityPair,
      inboundCityPair: reverse.lowestCityPair,
      totalObservations: r.totalObservations + reverse.totalObservations,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5. Load + map
// ---------------------------------------------------------------------------
console.log("Loading airport city index from supabase/seed/airports.sql…");
const airportRows = loadAirportCityIndex();
const index = buildCityCountryIndex(airportRows);
console.log(`  ${index.airports} airport rows, ${index.byCity.size} distinct normalised city names.`);

if (!existsSync(ROUTES_FILE)) {
  console.log("Downloading routes.csv from Hugging Face…");
  execFileSync("wget", ["-q", "-O", ROUTES_FILE, ROUTES_URL], { stdio: "inherit" });
}
const csv = readFileSync(ROUTES_FILE, "utf8");
const lines = csv.split("\n");
const header = parseCsvLine(lines[0]);
const col = (name) => header.indexOf(name);
for (const req of ["origin_city", "destination_city", "observations", "median_eur", "min_eur", "departure_months", "first_observed", "last_observed"]) {
  if (col(req) === -1) { console.error(`Dataset missing expected column: ${req}`); process.exit(1); }
}

let matched = [];
const reviewRows = new Map(); // city -> {countries, sampleRoutes}
let domestic = 0;
let dupCountryPairKept = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line || !line.trim()) continue;
  const c = parseCsvLine(line);
  const originCity = c[col("origin_city")];
  const destinationCity = c[col("destination_city")];
  const observations = numOrNull(c[col("observations")], { min: 0 });
  const medianEur = numOrNull(c[col("median_eur")], { min: 0 });
  const minEur = numOrNull(c[col("min_eur")], { min: 0 });
  const departureMonths = numOrNull(c[col("departure_months")], { min: 0 });
  const firstObserved = (c[col("first_observed")] || "").slice(0, 10);
  const lastObserved = (c[col("last_observed")] || "").slice(0, 10);
  if (observations === null || medianEur === null || minEur === null) continue;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstObserved) || !/^\d{4}-\d{2}-\d{2}$/.test(lastObserved)) continue;

  const om = matchCityToCountries(index, originCity);
  const dm = matchCityToCountries(index, destinationCity);
  for (const [city, m] of [[originCity, om], [destinationCity, dm]]) {
    if (m.kind !== "unique" && !reviewRows.has(city)) {
      reviewRows.set(city, { countries: m.countries, kind: m.kind, sampleRoutes: 0 });
    }
    if (m.kind !== "unique" && reviewRows.has(city)) reviewRows.get(city).sampleRoutes++;
  }
  if (om.kind !== "unique" || dm.kind !== "unique") continue; // review queue, never guessed
  const originIso = om.countries[0];
  const destinationIso = dm.countries[0];
  if (originIso === destinationIso) { domestic++; continue; }
  matched.push({
    originCity, destinationCity, originIso, destinationIso,
    observations, medianEur, minEur, departureMonths, firstObserved, lastObserved,
  });
}
dupCountryPairKept = matched.length;

console.log(`  ${lines.length - 1} dataset rows → ${matched.length} uniquely-matched international city routes`);
console.log(`  ${domestic} domestic routes skipped · ${reviewRows.size} city names queued for review`);

const refs = aggregateCountryPairRefs(matched);
const derived = deriveRoundTrips(refs);
console.log(`  ${refs.length} country pairs with observed one-way references · ${derived.length} derived round-trip references`);

// ---------------------------------------------------------------------------
// 6. Emit SQL — one needs_research marker row per airport-served pair that has
//    no observations; refresh never overwrites admin review decisions.
// ---------------------------------------------------------------------------
const IMPORT_TAG = `flight-fare-history@${new Date().toISOString().slice(0, 10)}`;
const SOURCE_URL = "https://huggingface.co/datasets/DeusHorizon/flight-fare-history";
const LICENSE = "CC-BY-4.0";

function refValues(r) {
  return `  (${esc(r.originIso)}, ${esc(r.destinationIso)}, 'observed_one_way_history', ${r.lowestObservedEur.toFixed(2)}, ${esc(r.lowestCityPair)}, ${r.medianOfContributingRouteEur.toFixed(2)}, ${r.totalObservations}, ${r.cityRouteCount}, ${esc(r.firstObserved)}, ${esc(r.lastObserved)}, ${esc(SOURCE_URL)}, ${esc(LICENSE)}, 'needs_review')`;
}

function derivedValues(d) {
  const sources = JSON.stringify([
    { origin: d.originIso, destination: d.destinationIso, median_eur: d.outboundMedianEur, city_pair: d.outboundCityPair, last_observed: d.outboundLastObserved },
    { origin: d.destinationIso, destination: d.originIso, median_eur: d.inboundMedianEur, city_pair: d.inboundCityPair, last_observed: d.inboundLastObserved },
  ]).replace(/'/g, "''");
  return `  (${esc(d.originIso)}, ${esc(d.destinationIso)}, 'derived_round_trip_reference', ${d.derivedEur.toFixed(2)}, ${d.outboundMedianEur.toFixed(2)}, ${d.inboundMedianEur.toFixed(2)}, ${esc(sources)}, ${d.totalObservations}, ${esc(SOURCE_URL)}, ${esc(LICENSE)}, 'needs_review')`;
}

const sql = `-- ============================================================================
-- country_fare_refs.sql — OBSERVED historical fare references (GENERATED FILE)
-- Source: flight-fare-history (https://huggingface.co/datasets/DeusHorizon/flight-fare-history)
-- License: ${LICENSE} · Prices are one-way ADVERTISED fares in EUR as collected
-- by the source. They are historical observations — never today's bookable
-- price, never a quote, never a guarantee.
-- Downloaded: ${new Date().toISOString().slice(0, 10)} by scripts/load-fare-history.mjs
-- Pairs with observed data: ${refs.length} · derived round trips: ${derived.length}
-- City names queued for review: ${reviewRows.size}
-- Import tag: ${IMPORT_TAG}
--
-- The refresh upsert only touches source-derived fields. verification_status,
-- review fields and currency displays are NEVER overwritten: an administrator
-- decision survives every re-import.
-- ============================================================================

-- 1. Observed one-way country-pair references --------------------------------
insert into public.country_fare_refs as r
  (origin_iso, destination_iso, fare_kind, amount, currency,
   lowest_city_pair, median_of_contributing_route, observation_count,
   supporting_city_routes, observation_from, observation_to,
   source_url, source_license, verification_status)
values
${refs.map(refValues).join(",\n")}
on conflict (origin_iso, destination_iso, fare_kind) do update set
  amount = excluded.amount,
  lowest_city_pair = excluded.lowest_city_pair,
  median_of_contributing_route = excluded.median_of_contributing_route,
  observation_count = excluded.observation_count,
  supporting_city_routes = excluded.supporting_city_routes,
  observation_from = excluded.observation_from,
  observation_to = excluded.observation_to,
  source_url = excluded.source_url,
  source_license = excluded.source_license,
  source_dataset = '${IMPORT_TAG}';

-- 2. Derived round-trip references (sum of two one-way MEDIANS) --------------
insert into public.derived_round_trip_refs as d
  (origin_iso, destination_iso, fare_kind, derived_amount, currency,
   outbound_median, inbound_median, source_routes, observation_count,
   source_url, source_license, verification_status)
values
${derived.map(derivedValues).join(",\n")}
on conflict (origin_iso, destination_iso, fare_kind) do update set
  derived_amount = excluded.derived_amount,
  outbound_median = excluded.outbound_median,
  inbound_median = excluded.inbound_median,
  source_routes = excluded.source_routes,
  observation_count = excluded.observation_count,
  source_url = excluded.source_url,
  source_license = excluded.source_license,
  source_dataset = '${IMPORT_TAG}';

-- 3. City names that could not be mapped to one country ----------------------
insert into public.fare_mapping_review (city_name, match_kind, possible_countries, dataset_routes, source_url)
values
${[...reviewRows.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([city, info]) => `  (${esc(city)}, ${esc(info.kind)}, ${esc(info.countries.join(", ") || null)}, ${info.sampleRoutes}, ${esc(SOURCE_URL)})`)
  .join(",\n")}
on conflict (city_name) do update set
  match_kind = excluded.match_kind,
  possible_countries = excluded.possible_countries,
  dataset_routes = excluded.dataset_routes,
  resolved = false,
  resolved_country = null;

-- 4. needs_research markers: every airport-served international pair whose
--    origin AND destination appear in the observed set's country universe,
--    but which has no observation of its own. Amount stays NULL.
insert into public.country_fare_refs
  (origin_iso, destination_iso, fare_kind, currency, source_url, source_license, verification_status)
select o.iso2, d.iso2, 'needs_research', 'EUR', ${esc(SOURCE_URL)}, ${esc(LICENSE)}, 'needs_research'
from public.countries o
join public.countries d on d.iso2 <> o.iso2
where exists (select 1 from public.country_fare_refs x where x.fare_kind = 'observed_one_way_history' and x.origin_iso = o.iso2)
  and exists (select 1 from public.country_fare_refs x where x.fare_kind = 'observed_one_way_history' and x.destination_iso = d.iso2)
on conflict (origin_iso, destination_iso, fare_kind) do nothing;

-- 5. Public display currency (admin-editable, documented rate). EUR original
--    values are always preserved in the amount column; this only sets how the
--    public pages CONVERT for display.
insert into public.fare_display_settings (id, display_currency, rate_to_display, rate_source, rate_as_of)
values (1, 'BDT', 132.50, 'Manual admin placeholder — set the documented rate before publishing', current_date)
on conflict (id) do update set
  display_currency = excluded.display_currency,
  rate_to_display = excluded.rate_to_display,
  rate_source = excluded.rate_source,
  rate_as_of = excluded.rate_as_of,
  updated_at = now();
`;

writeFileSync(OUT, sql);

// ---------------------------------------------------------------------------
// 7. Import report (printed; also written as JSON next to the seed)
// ---------------------------------------------------------------------------
const report = {
  generated_at: new Date().toISOString(),
  dataset: SOURCE_URL,
  license: LICENSE,
  dataset_rows: lines.length - 1,
  uniquely_matched_international_city_routes: matched.length,
  domestic_routes_skipped: domestic,
  city_names_in_review_queue: reviewRows.size,
  country_pairs_with_observed_one_way: refs.length,
  derived_round_trip_references: derived.length,
  needs_research_markers: "inserted at SQL level for pairs within the observed country universe",
  note: "amounts are historical EUR one-way observations; the derived values are sums of medians, not observed returns",
};
writeFileSync(`${DATA_DIR}/import-report.json`, JSON.stringify(report, null, 2));
console.log(`Wrote ${OUT}`);
console.log(JSON.stringify(report, null, 2));
