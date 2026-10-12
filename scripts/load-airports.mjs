#!/usr/bin/env node
/**
 * Downloads the public-domain OurAirports airports.csv dataset and emits
 * supabase/seed/airports.sql (idempotent upserts keyed on `ident`).
 *
 * License: OurAirports data is in the public domain
 * (https://davidmegginson.github.io/ourairports-data/ — see also
 * https://ourairports.com/data/ ). No attribution is legally required; we
 * record the source and load date in the SQL header for honesty.
 *
 * Filtering: scheduled-service airports ("large_airport", "medium_airport")
 * plus "small_airport" rows that have an IATA code — keeps the file compact
 * while covering essentially all commercial departures. Scheduled/closed
 * airports are excluded entirely. Coordinates are stored verbatim from the
 * dataset (they are the verified source values).
 *
 * Run: node scripts/load-airports.mjs
 */
import { writeFileSync } from "node:fs";

const CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const OUT = "supabase/seed/airports.sql";
const TYPES = new Set(["large_airport", "medium_airport"]);

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
  return s === null || s === undefined ? "null" : `'${String(s).replace(/'/g, "''")}'`;
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
      iIso = col("iso_country"), iMuni = col("municipality"), iIata = col("iata_code"),
      iIcao = col("icao_code"), iSched = col("scheduled_service");

const rows = [];
let skippedNoCountry = 0;
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const c = parseCsvLine(line);
  const type = c[iType];
  const iata = c[iIata] && c[iIata] !== "\\N" ? c[iIata] : null;
  const keep =
    TYPES.has(type) ||
    (type === "small_airport" && iata) ||
    (iata && (type === "seaplane_base" || type === "heliport"));
  if (!keep) continue;
  const iso = c[iIso] && c[iIso] !== "\\N" ? c[iIso] : null;
  if (!iso) { skippedNoCountry++; continue; }
  const lat = Number(c[iLat]), lon = Number(c[iLon]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  rows.push({
    ident: c[iIdent],
    iata,
    icao: c[iIcao] && c[iIcao] !== "\\N" ? c[iIcao] : null,
    name: c[iName],
    city: c[iMuni] && c[iMuni] !== "\\N" ? c[iMuni] : null,
    iso,
    lat: lat.toFixed(6),
    lon: lon.toFixed(6),
    elev: c[iElev] && c[iElev] !== "\\N" ? parseInt(c[iElev], 10) : null,
    type,
  });
}

const today = new Date().toISOString().slice(0, 10);
const out = [];
out.push(`-- ============================================================================`);
out.push(`-- airports.sql — generated ${today} by scripts/load-airports.mjs. DO NOT EDIT BY HAND.`);
out.push(`-- Source: OurAirports (davidmegginson.github.io/ourairports-data), public domain.`);
out.push(`-- Filter: large/medium airports plus small airports having an IATA code.`);
out.push(`-- ${rows.length} airports${skippedNoCountry ? `, ${skippedNoCountry} rows skipped (no country code)` : ""}.`);
out.push(`-- Re-run this script to refresh; upserts are idempotent and never delete,`);
out.push(`-- so orders referencing an airport are untouched.`);
out.push(`-- ============================================================================`);
out.push(`insert into public.airports (ident, iata_code, icao_code, name, city_municipality, iso_country, latitude, longitude, elevation_ft, airport_type, source)`);
out.push(`values`);

const chunks = [];
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  chunks.push(
    `  (${esc(r.ident)}, ${esc(r.iata)}, ${esc(r.icao)}, ${esc(r.name)}, ${esc(r.city)}, ${esc(r.iso)}, ${r.lat}, ${r.lon}, ${r.elev === null ? "null" : r.elev}, ${esc(r.type)}, 'ourairports')`,
  );
}
out.push(chunks.join(",\n"));
out.push(`on conflict (ident) do update set`);
out.push(`  iata_code = excluded.iata_code,`);
out.push(`  icao_code = excluded.icao_code,`);
out.push(`  name = excluded.name,`);
out.push(`  city_municipality = excluded.city_municipality,`);
out.push(`  iso_country = excluded.iso_country,`);
out.push(`  latitude = excluded.latitude,`);
out.push(`  longitude = excluded.longitude,`);
out.push(`  elevation_ft = excluded.elevation_ft,`);
out.push(`  airport_type = excluded.airport_type;`);

writeFileSync(OUT, out.join("\n") + "\n");
console.log(`Wrote ${OUT}: ${rows.length} airports.`);
