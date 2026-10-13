/**
 * Worldwide country-pair fare matrix tests: matrix generation and
 * deduplication, honest display states, display-currency conversion, CSV row
 * validation (amounts, dates, sources), CSV export round-trip, city-name
 * mapping/ambiguity, derived round-trip rules, and the loader/TS-library
 * parity that keeps generated SQL trustworthy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  generateCountryPairs,
  pairKey,
  countryPairDisplayState,
  convertForDisplay,
  validateFareCsvRow,
  fareRefsToCsv,
  FARE_CSV_COLUMNS,
} from "../../src/lib/country-matrix.ts";
import {
  normalizeCityName,
  cityAliases,
  buildCityCountryIndex,
  matchCityToCountries,
  aggregateCountryPairRefs,
  deriveRoundTrips,
  round2,
} from "../../src/lib/fare-history.ts";

const TODAY = "2026-10-13";

// --- matrix generation -------------------------------------------------------

test("country-pair matrix: ordered, deduplicated, no self-pairs", () => {
  const pairs = generateCountryPairs(["BD", "GB", "bd", "US", " XX ", "GB"]);
  // 4 clean countries → 4×3 = 12 ordered pairs
  assert.equal(pairs.length, 12);
  assert.ok(pairs.every((p) => p.originIso !== p.destinationIso));
  const keys = new Set(pairs.map((p) => `${p.originIso}>${p.destinationIso}`));
  assert.equal(keys.size, 12); // no duplicates
  assert.ok(keys.has("BD>GB"));
  assert.ok(keys.has("GB>BD")); // both directions present (export market order)
  assert.equal(keys.has("BD>BD"), false);
});

test("country-pair matrix: single country yields zero pairs", () => {
  assert.deepEqual(generateCountryPairs(["BD"]), []);
  assert.deepEqual(generateCountryPairs([]), []);
  assert.deepEqual(generateCountryPairs(["nope", "B"]), []); // invalid codes dropped
});

test("pairKey is symmetric", () => {
  assert.equal(pairKey("BD", "GB"), pairKey("GB", "BD"));
});

// --- display states ----------------------------------------------------------

test("countryPairDisplayState distinguishes all five honest states", () => {
  assert.equal(countryPairDisplayState({ fareKind: "observed_one_way_history", verificationStatus: "verified" }), "verified_history");
  assert.equal(countryPairDisplayState({ fareKind: "observed_one_way_history", verificationStatus: "needs_review" }), "needs_review");
  assert.equal(countryPairDisplayState({ fareKind: "needs_research", verificationStatus: "needs_research" }), "needs_research");
  assert.equal(
    countryPairDisplayState({ fareKind: null, verificationStatus: null, derivedStatus: "verified" }),
    "verified_round_trip_reference",
  );
  assert.equal(countryPairDisplayState({ fareKind: null, verificationStatus: null }), "unsupported");
  // rejected observed data falls back to needs_research — never shown as a price
  assert.equal(countryPairDisplayState({ fareKind: "observed_one_way_history", verificationStatus: "rejected" }), "needs_research");
});

// --- conversion --------------------------------------------------------------

test("display conversion keeps EUR original semantics and rounds to 2dp", () => {
  assert.equal(convertForDisplay(100, 132.5), 13250);
  assert.equal(convertForDisplay(33.33, 1.0), 33.33);
  assert.equal(convertForDisplay(10, 1 / 3), 3.33);
});

// --- CSV row validation ------------------------------------------------------

const goodRow = {
  origin_iso: "BD",
  destination_iso: "GB",
  one_way_eur: "412.00",
  return_eur: "",
  lowest_city_pair: "London Gatwick → London",
  observation_from: "2026-09-01",
  observation_to: "2026-10-01",
  observation_count: "58",
  source_url: "https://example.org/source",
  source_license: "CC-BY-4.0",
};

test("valid one-way row passes and keeps amounts", () => {
  const r = validateFareCsvRow(goodRow, TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.patch?.oneWayAmount, 412.0);
  assert.equal(r.patch?.observationCount, 58);
  assert.equal(r.patch?.returnDerivedAmount, undefined);
});

test("return-only row is stored as a derived reference", () => {
  const r = validateFareCsvRow({ ...goodRow, one_way_eur: "", return_eur: "210.00", lowest_city_pair: "", observation_count: "" }, TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.patch?.oneWayAmount, undefined);
  assert.equal(r.patch?.returnDerivedAmount, 210.0);
});

test("both empty amounts are rejected", () => {
  const r = validateFareCsvRow({ ...goodRow, one_way_eur: "", return_eur: "" }, TODAY);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /no amount/);
});

test("negative, zero and malformed amounts are rejected", () => {
  assert.equal(validateFareCsvRow({ ...goodRow, one_way_eur: "-5" }, TODAY).ok, false);
  assert.equal(validateFareCsvRow({ ...goodRow, one_way_eur: "0" }, TODAY).ok, false);
  assert.equal(validateFareCsvRow({ ...goodRow, one_way_eur: "12.999" }, TODAY).ok, false);
  assert.equal(validateFareCsvRow({ ...goodRow, one_way_eur: "abc" }, TODAY).ok, false);
});

test("domestic pairs and bad ISO codes are rejected", () => {
  assert.match(validateFareCsvRow({ ...goodRow, destination_iso: "BD" }, TODAY).reason ?? "", /domestic/);
  assert.equal(validateFareCsvRow({ ...goodRow, origin_iso: "BGD" }, TODAY).ok, false);
  assert.equal(validateFareCsvRow({ ...goodRow, origin_iso: "" }, TODAY).ok, false);
});

test("return below one-way is rejected without written justification", () => {
  const r = validateFareCsvRow({ ...goodRow, return_eur: "10.00" }, TODAY);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /return below one-way/);
});

test("missing source or license is rejected", () => {
  assert.match(validateFareCsvRow({ ...goodRow, source_url: "" }, TODAY).reason ?? "", /source_url/);
  assert.match(validateFareCsvRow({ ...goodRow, source_license: "" }, TODAY).reason ?? "", /source_license/);
  // a named authority (not a URL) is acceptable
  const r = validateFareCsvRow({ ...goodRow, source_url: "piratefly.com collector" }, TODAY);
  assert.equal(r.ok, true);
});

test("invalid dates are rejected: shapes, order, future windows", () => {
  assert.equal(validateFareCsvRow({ ...goodRow, observation_from: "2026-13-01" }, TODAY).ok, false);
  assert.equal(validateFareCsvRow({ ...goodRow, observation_from: "01/09/2026" }, TODAY).ok, false);
  assert.equal(validateFareCsvRow({ ...goodRow, observation_to: "2026-08-01" }, TODAY).ok, false);
  assert.equal(validateFareCsvRow({ ...goodRow, observation_from: "2026-10-14" }, TODAY).ok, false);
});

// --- CSV export --------------------------------------------------------------

test("CSV export includes all states and escapes safely", () => {
  const csv = fareRefsToCsv([
    {
      origin_iso: "BD", destination_iso: "GB", fare_kind: "observed_one_way_history",
      amount: 412, lowest_city_pair: "City, with comma", median_of_contributing_route: 500.5,
      observation_count: 58, observation_from: "2026-09-01", observation_to: "2026-10-01",
      source_url: "https://example.org", source_license: "CC-BY-4.0", verification_status: "verified",
    },
    {
      origin_iso: "BD", destination_iso: "AE", fare_kind: "needs_research", amount: null,
      lowest_city_pair: null, median_of_contributing_route: null, observation_count: null,
      observation_from: null, observation_to: null, source_url: "internal", source_license: null,
      verification_status: "needs_research",
    },
  ]);
  const lines = csv.split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "origin_iso,destination_iso,fare_kind,amount_eur,lowest_city_pair,median_eur,observation_count,observation_from,observation_to,source_url,source_license,verification_status");
  assert.match(lines[1], /"City, with comma"/);
  assert.match(lines[2], /needs_research,,/); // NULL amount stays empty — no invented 0
});

test("export header columns match the documented template set", () => {
  assert.ok(FARE_CSV_COLUMNS.includes("one_way_eur"));
  assert.ok(FARE_CSV_COLUMNS.includes("return_eur"));
  assert.ok(FARE_CSV_COLUMNS.includes("source_license"));
});

// --- city mapping ------------------------------------------------------------

test("city normalisation strips diacritics, punctuation, and case", () => {
  assert.equal(normalizeCityName("São Paulo"), "sao paulo");
  assert.equal(normalizeCityName("Xi'an"), "xi an");
  assert.equal(normalizeCityName("  Washington, D.C. "), "washington d c");
  assert.equal(normalizeCityName("İZM"), "izm");
});

test("city aliases: Jeju City → jeju, Phu Quoc Island → phu quoc", () => {
  assert.deepEqual(cityAliases("Jeju City"), ["jeju city", "jeju"]);
  assert.deepEqual(cityAliases("Phu Quoc Island"), ["phu quoc island", "phu quoc"]);
});

test("unique single-country city matches; multi-country names are ambiguous; unknown unmatched", () => {
  const index = buildCityCountryIndex([
    { city: "Dhaka", isoCountry: "BD" },
    { city: "Dhaka", isoCountry: "BD" },
    { city: "Jeju City", isoCountry: "KR" },
    { city: "London", isoCountry: "GB" },
    { city: "London", isoCountry: "CA" }, // data-quality case: same name, two countries
  ]);
  assert.deepEqual(matchCityToCountries(index, "Dhaka"), { kind: "unique", countries: ["BD"] });
  assert.deepEqual(matchCityToCountries(index, "Jeju City"), { kind: "unique", countries: ["KR"] });
  const london = matchCityToCountries(index, "London");
  assert.equal(london.kind, "ambiguous");
  assert.deepEqual(london.countries, ["CA", "GB"]);
  assert.deepEqual(matchCityToCountries(index, "Atlantis"), { kind: "unmatched", countries: [] });
});

// --- aggregation + derived round trips ----------------------------------------

function route(o: string, oo: string, d: string, dd: string, median: number, min: number, obs: number) {
  return {
    originCity: o, destinationCity: d, originIso: oo, destinationIso: dd,
    observations: obs, medianEur: median, minEur: min, departureMonths: 5,
    firstObserved: "2026-06-14", lastObserved: "2026-10-13",
  };
}

test("country-pair aggregation picks the lowest observed route and keeps the median separate", () => {
  const refs = aggregateCountryPairRefs([
    route("Dhaka", "BD", "London", "GB", 500, 400, 100),
    route("Sylhet", "BD", "Manchester", "GB", 600, 350, 50),
  ]);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].lowestObservedEur, 350);
  assert.equal(refs[0].medianOfContributingRouteEur, 600); // the CONTRIBUTING route's own median
  assert.equal(refs[0].totalObservations, 150);
  assert.equal(refs[0].cityRouteCount, 2);
  assert.match(refs[0].lowestCityPair, /Sylhet/);
});

test("domestic city routes never create country-pair rows", () => {
  const refs = aggregateCountryPairRefs([route("Tokyo", "JP", "Osaka", "JP", 50, 25, 4422)]);
  assert.equal(refs.length, 0);
});

test("derived round trips exist only when BOTH directions are observed, emitted once per unordered pair", () => {
  const refs = aggregateCountryPairRefs([
    route("Dhaka", "BD", "Dubai", "AE", 200, 150, 100),
    route("Dubai", "AE", "Dhaka", "BD", 180, 120, 90),
    route("Dhaka", "BD", "London", "GB", 500, 400, 100), // no reverse → no derived
  ]);
  const derived = deriveRoundTrips(refs);
  assert.equal(derived.length, 1);
  // Emitted once per unordered pair, anchored at the lexicographically first side (AE < BD).
  assert.equal(derived[0].originIso, "AE");
  assert.equal(derived[0].destinationIso, "BD");
  assert.equal(derived[0].derivedEur, 380); // 180 + 200 — the two medians, labelled derived
  assert.equal(derived[0].outboundMedianEur, 180); // anchored on the AE→BD side
  assert.equal(derived[0].inboundMedianEur, 200);
  assert.equal(derived[0].sources.length, 2);
});

test("round2 keeps cent precision without float drift", () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
});

// --- loader ↔ library parity ---------------------------------------------------

test("loader script mirrors the library's alias + aggregation rules", () => {
  const src = readFileSync("scripts/load-fare-history.mjs", "utf8");
  assert.match(src, / city\$/);
  assert.match(src, / islands\?\$/);
  assert.match(src, /originIso === r\.destinationIso\) continue/);
  assert.match(src, /derived_round_trip_reference/);
});

// --- generated seed sanity -----------------------------------------------------

test("generated seed exists, is headered, and every value row cites the license", () => {
  const sql = readFileSync("supabase/seed/country_fare_refs.sql", "utf8");
  assert.match(sql, /^-- =+\n-- country_fare_refs\.sql — OBSERVED historical fare references/);
  assert.match(sql, /CC-BY-4\.0/);
  assert.match(sql, /insert into public\.country_fare_refs/);
  assert.match(sql, /insert into public\.derived_round_trip_refs/);
  assert.match(sql, /insert into public\.fare_mapping_review/);
  // needs_research marker insert keeps amounts NULL
  assert.match(sql, /select o\.iso2, d\.iso2, 'needs_research', 'EUR'/);
});

// --- migration 0009 invariants --------------------------------------------------

test("migration 0009: needs_research rows can never carry an amount", () => {
  const sql = readFileSync("supabase/migrations/0009_country_fare_matrix.sql", "utf8");
  assert.match(sql, /country_fare_refs_shape/);
  assert.match(sql, /fare_kind = 'needs_research' and amount is null/);
  assert.match(sql, /fare_kind = 'observed_one_way_history' and amount is not null/);
});

test("migration 0009: review decisions require reviewer identity (trigger) and imports preserve them", () => {
  const sql = readFileSync("supabase/migrations/0009_country_fare_matrix.sql", "utf8");
  assert.match(sql, /A review decision must record reviewed_by and reviewed_at/);
  assert.match(sql, /country_fare_ref_import_guard/);
  assert.match(sql, /derived_ref_import_guard/);
});

test("migration 0009: RLS enabled on all four new tables with staff-only writes", () => {
  const sql = readFileSync("supabase/migrations/0009_country_fare_matrix.sql", "utf8");
  for (const t of ["country_fare_refs", "derived_round_trip_refs", "fare_mapping_review", "fare_display_settings"]) {
    assert.ok(sql.includes(`'${t}'`), `${t} missing from RLS enable loop`);
  }
  assert.match(sql, /verification_status = 'verified' or public\.is_staff\(\)/);
});

test("migration 0009 is idempotent-safe: bare CREATEs only inside duplicate_object traps", () => {
  const sql = readFileSync("supabase/migrations/0009_country_fare_matrix.sql", "utf8");
  const bare = [
    ...sql.matchAll(/^(?!.*(if not exists|or replace|exception when duplicate_object))\s*create (table|type|function|policy|index)\b[^;]*$/gmi),
  ];
  for (const m of bare) {
    const around = sql.slice(Math.max(0, (m.index ?? 0) - 400), (m.index ?? 0) + 400);
    assert.match(around, /exception when duplicate_object|if not exists|or replace/i);
  }
  assert.equal((sql.match(/\$\$/g) ?? []).length % 2, 0, "dollar-quoted blocks balanced");
});
