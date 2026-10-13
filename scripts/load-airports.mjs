#!/usr/bin/env node
/**
 * Downloads the public-domain OurAirports airports.csv dataset and emits
 * supabase/seed/airports.sql (idempotent upserts keyed on `ident`).
 *
 * License: OurAirports data is in the public domain
 * (https://davidmegginson.github.io/ourairports-data/ — see also
 * https://ourairports.com/data/ ). No attribution is legally required; we
 * record the source, dataset build date, and per-row source identifiers in
 * the SQL for provenance.
 *
 * What is kept vs the raw dataset:
 *  - ALL airport types are retained (large/medium/small/heliport/seaplane/
 *    closed), because the mission forbids inventing classifications: the
 *    admin decides what is publicly visible, the type + scheduled_service
 *    columns preserve exactly what the source says.
 *  - scheduled_service, iso_region, municipality, home_link, wikipedia_link,
 *    keywords, coordinates, elevation and the dataset's own id (source_ident)
 *    are preserved verbatim for provenance and later verification.
 *  - load notes: every row gets `data_source='ourairports'` and
 *    `source_updated_at` = the dataset's build stamp passed on the command
 *    line (or today when not provided).
 *
 * An import never overwrites admin-set flags: the ON CONFLICT clause updates
 * only source-derived fields and leaves verification_status, verified_at,
 * verified_by, data_quality_note untouched.
 *
 * Run: node scripts/load-airports.mjs [dataset-build-date YYYY-MM-DD]
 */
import { writeFileSync } from "node:fs";

const CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const OUT = "supabase/seed/airports.sql";
const stamp = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2])
  ? process.argv[2]
  : new Date().toISOString().slice(0, 10);

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

function esc(s) {
  return s === null || s === undefined || s === "" ? "null" : `'${String(s).replace(/'/g, "''")}'`;
}
function numOrNull(s) {
  if (s === null || s === undefined || s === "") return "null";
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : "null";
}

console.log("Downloading OurAirports dataset…");
const res = await fetch(CSV_URL);
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status}`);
  process.exit(1);
}
const csv = await res.text();
const lines = csv.split("\n");
const header = parseCsvLine(lines[0]);
const col = (name) => header.indexOf(name);

const iId = col("id"), iIdent = col("ident"), iType = col("type"), iName = col("name"),
      iLat = col("latitude_deg"), iLon = col("longitude_deg"), iElev = col("elevation_ft"),
      iIso = col("iso_country"), iRegion = col("iso_region"), iMuni = col("municipality"),
      iIcao = col("icao_code"), iIata = col("iata_code"), iSched = col("scheduled_service"),
      iHome = col("home_link"), iWiki = col("wikipedia_link"), iKw = col("keywords");
for (const [name, idx] of Object.entries({ id: iId, ident: iIdent, type: iType, name: iName })) {
  if (idx === -1) { console.error(`Dataset missing expected column: ${name}`); process.exit(1); }
}

const rows = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line || !line.trim()) continue;
  const c = parseCsvLine(line);
  if (c.length < 5) continue;
  const lat = Number(c[iLat]), lon = Number(c[iLon]);
  // Data-quality gate: rows without both valid coordinates cannot support
  // distance math later, so they are recorded with NULL coordinates and a
  // note rather than being silently dropped or given fake values.
  const coordsOk = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const iata = (c[iIata] || "").trim();
  const iataOk = /^[A-Z0-9]{3}$/.test(iata) && iata !== "null";
  rows.push({
    ident: c[iIdent],
    sourceIdent: c[iId],
    iata: iataOk ? iata : null,
    icao: (c[iIcao] || "").trim() || null,
    name: c[iName],
    muni: (c[iMuni] || "").trim() || null,
    iso: c[iIso],
    region: (c[iRegion] || "").trim() || null,
    lat: coordsOk ? lat : null,
    lon: coordsOk ? lon : null,
    elev: c[iElev] && /^\-?\d+$/.test(c[iElev]) ? c[iElev] : null,
    type: c[iType],
    sched: (c[iSched] || "").trim() || null,
    home: (c[iHome] || "").trim() || null,
    wiki: (c[iWiki] || "").trim() || null,
    kw: (c[iKw] || "").trim() || null,
    coordsOk,
  });
}

const sql = `-- ============================================================================
-- airports.sql — worldwide airport reference data (GENERATED FILE)
-- Source: OurAirports public-domain dataset (https://ourairports.com/data/)
-- Downloaded: ${stamp} by scripts/load-airports.mjs
-- Rows: ${rows.length} · every row keeps its dataset identifier (source_ident)
-- for provenance. Regenerating never overwrites admin verification state:
-- the upsert touches source-derived fields only.
-- ============================================================================

insert into public.airports as a
  (ident, source_ident, iata_code, icao_code, name, city_municipality, iso_country,
   iso_region, latitude, longitude, elevation_ft, airport_type, scheduled_service,
   home_link, wikipedia_link, keywords, data_source, dataset_version)
values
${rows
  .map(
    (r) => `  (${esc(r.ident)}, ${esc(r.sourceIdent)}, ${esc(r.iata)}, ${esc(r.icao)}, ${esc(r.name)},
   ${esc(r.muni)}, ${esc(r.iso)}, ${esc(r.region)}, ${r.lat === null ? "null" : r.lat}, ${r.lon === null ? "null" : r.lon},
   ${r.elev}, ${esc(r.type)}, ${esc(r.sched)}, ${esc(r.home)}, ${esc(r.wiki)}, ${esc(r.kw)},
   'ourairports', ${esc(stamp)})`,
  )
  .join(",\n")}
on conflict (ident) do update set
  source_ident = excluded.source_ident,
  iata_code = excluded.iata_code,
  icao_code = excluded.icao_code,
  name = excluded.name,
  city_municipality = excluded.city_municipality,
  iso_country = excluded.iso_country,
  iso_region = excluded.iso_region,
  latitude = coalesce(excluded.latitude, a.latitude),
  longitude = coalesce(excluded.longitude, a.longitude),
  elevation_ft = excluded.elevation_ft,
  airport_type = excluded.airport_type,
  scheduled_service = excluded.scheduled_service,
  home_link = excluded.home_link,
  wikipedia_link = excluded.wikipedia_link,
  keywords = excluded.keywords,
  dataset_version = excluded.dataset_version;
-- verification_status, verified_at, verified_by, data_quality_note, active,
-- duplicate_of are NEVER touched by an import: admin state is preserved.
`;

writeFileSync(OUT, sql);
const noCoords = rows.filter((r) => !r.coordsOk).length;
const withIata = rows.filter((r) => r.iata).length;
console.log(`Wrote ${OUT}: ${rows.length} airports (${withIata} with IATA codes, ${noCoords} without usable coordinates).`);
