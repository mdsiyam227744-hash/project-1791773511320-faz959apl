/**
 * Reference-data validation tests: code shapes, coordinate ranges, fare
 * observation state machine + staleness, CSV parsing, import row validation,
 * package price breakdown, and migration-0008 SQL invariants.
 * Runs on the plain Node test runner — no database required.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isValidCountryCode,
  isValidIataAirportCode,
  isValidIataAirlineCode,
  isValidIcaoAirportCode,
  checkCoordinates,
  isIsoDate,
  isValidCurrency,
  isValidHttpUrl,
  isValidAmount,
  canTransitionFareStatus,
  fareDisplayState,
  isFareObservationStale,
  isPubliclyOperating,
  parseCsv,
  validateAirportImportRow,
} from "../../src/lib/reference-data.ts";
import { packageLines, slugifyPackage, type VisaPackageCore } from "../../src/lib/package-pricing.ts";

// --- code shapes -----------------------------------------------------------

test("country/IATA/ICAO code validators", () => {
  assert.equal(isValidCountryCode("BD"), true);
  assert.equal(isValidCountryCode("bd"), true);
  assert.equal(isValidCountryCode("BGD"), false);
  assert.equal(isValidCountryCode("B"), false);
  assert.equal(isValidIataAirportCode("DAC"), true);
  assert.equal(isValidIataAirportCode("DAC1"), false);
  assert.equal(isValidIataAirportCode("dac"), false);
  assert.equal(isValidIataAirlineCode("BG"), true);
  assert.equal(isValidIataAirlineCode("B3"), true);
  assert.equal(isValidIataAirlineCode("B"), false);
  assert.equal(isValidIcaoAirportCode("VGHS"), true);
  assert.equal(isValidIcaoAirportCode("VG1"), false);
  assert.equal(isValidIcaoAirportCode("VGH"), false);
});

// --- coordinates -----------------------------------------------------------

test("coordinate validation: ranges, non-numbers, antimeridian", () => {
  assert.deepEqual(checkCoordinates(23.81, 90.41), { ok: true, reason: null });
  assert.deepEqual(checkCoordinates(-90, 180), { ok: true, reason: null });
  assert.equal(checkCoordinates(91, 0).ok, false);
  assert.equal(checkCoordinates(0, -180.0001).ok, false);
  assert.equal(checkCoordinates("abc", 0).ok, false);
  assert.equal(checkCoordinates(null, 0).ok, false);
  assert.equal(checkCoordinates(NaN, 0).ok, false);
});

// --- dates / money / urls --------------------------------------------------

test("date, currency, amount, and URL validators", () => {
  assert.equal(isIsoDate("2026-10-13"), true);
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("2026-10-13T00:00:00Z"), false);
  assert.equal(isValidCurrency("USD"), true);
  assert.equal(isValidCurrency("usd"), false);
  assert.equal(isValidCurrency("USDT"), false);
  assert.equal(isValidAmount("129.50"), true);
  assert.equal(isValidAmount("-5"), false);
  assert.equal(isValidAmount("12.123"), false);
  assert.equal(isValidHttpUrl("https://www.gov.uk/visa-processing"), true);
  assert.equal(isValidHttpUrl("ftp://example.com"), false);
  assert.equal(isValidHttpUrl("not a url"), false);
});

// --- fare observation lifecycle -------------------------------------------

test("fare state machine allows review flow and blocks re-entry after decision", () => {
  assert.equal(canTransitionFareStatus("draft", "pending_review").ok, true);
  assert.equal(canTransitionFareStatus("pending_review", "published").ok, true);
  assert.equal(canTransitionFareStatus("pending_review", "rejected").ok, true);
  assert.equal(canTransitionFareStatus("published", "expired").ok, true);
  assert.equal(canTransitionFareStatus("published", "withdrawn").ok, true);
  assert.equal(canTransitionFareStatus("published", "pending_review").ok, false);
  assert.equal(canTransitionFareStatus("rejected", "published").ok, false);
  assert.equal(canTransitionFareStatus("expired", "published").ok, false);
});

test("published fares expire automatically at validity end or 90 days", () => {
  assert.equal(
    fareDisplayState({ status: "published", observationDate: "2026-08-01", validUntil: null, today: "2026-10-13" }),
    "indicative_current",
  );
  assert.equal(
    fareDisplayState({ status: "published", observationDate: "2026-01-01", validUntil: null, today: "2026-10-13" }),
    "expired",
  );
  assert.equal(
    fareDisplayState({ status: "published", observationDate: "2026-09-01", validUntil: "2026-10-01", today: "2026-10-13" }),
    "expired",
  );
  assert.equal(
    fareDisplayState({ status: "pending_review", observationDate: "2026-10-01", validUntil: null, today: "2026-10-13" }),
    "pending_verification",
  );
  assert.equal(
    fareDisplayState({ status: "draft", observationDate: "2026-10-01", validUntil: null, today: "2026-10-13" }),
    "no_data",
  );
  assert.equal(isFareObservationStale(null, "2026-01-01", "2026-10-13"), true);
  assert.equal(isFareObservationStale("2026-12-31", "2026-01-01", "2026-10-13"), false);
});

// --- routes ----------------------------------------------------------------

test("route operating states: only current/seasonal are publicly operating", () => {
  assert.equal(isPubliclyOperating("current"), true);
  assert.equal(isPubliclyOperating("seasonal"), true);
  assert.equal(isPubliclyOperating("unverified"), false);
  assert.equal(isPubliclyOperating("suspended"), false);
  assert.equal(isPubliclyOperating("discontinued"), false);
});

// --- CSV -------------------------------------------------------------------

test("CSV parser handles quotes, embedded commas/newlines, CRLF", () => {
  const { rows, errors } = parseCsv(
    'a,b,c\n"x,1","y""2""","line\nbreak"\r\n4,5,6\n',
  );
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ["a", "b", "c"]);
  assert.deepEqual(rows[1], ["x,1", 'y"2"', "line\nbreak"]);
  assert.deepEqual(rows[2], ["4", "5", "6"]);
});

test("CSV parser reports unterminated quotes", () => {
  const { errors } = parseCsv('a,"unclosed\n');
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /unterminated/);
});

// --- import row validation -------------------------------------------------

test("airport import rows: required fields, coordinate ranges, code shapes", () => {
  const valid = validateAirportImportRow({
    ident: "ZZ_TEST",
    name: "Test International",
    iso_country: "BD",
    latitude: "23.81",
    longitude: "90.41",
    iata_code: "ZZT",
    icao_code: "VGZZ",
  });
  assert.equal(valid.ok, true);

  assert.equal(
    validateAirportImportRow({ ident: "", name: "X airport", iso_country: "BD", latitude: "1", longitude: "2" }).ok,
    false,
  );
  assert.equal(
    validateAirportImportRow({ ident: "ZZ", name: "No country", iso_country: "BDD", latitude: "1", longitude: "2" }).ok,
    false,
  );
  const badCoords = validateAirportImportRow({
    ident: "ZZ",
    name: "Bad coords",
    iso_country: "BD",
    latitude: "99",
    longitude: "200",
  });
  assert.equal(badCoords.ok, false);
  assert.match(badCoords.reason ?? "", /coordinates/);
  assert.equal(
    validateAirportImportRow({ ident: "ZZ", name: "Bad IATA", iso_country: "BD", latitude: "1", longitude: "2", iata_code: "TOOLONG" }).ok,
    false,
  );
});

// --- package pricing -------------------------------------------------------

function pkg(overrides: Partial<VisaPackageCore> = {}): VisaPackageCore {
  return {
    official_gov_fee_amount: null,
    official_gov_fee_currency: null,
    official_gov_fee_verified: false,
    third_party_costs_en: null,
    third_party_costs_bn: null,
    service_fee_amount: 75,
    service_fee_currency: "USD",
    ...overrides,
  };
}

test("package breakdown separates government fee from service fee", () => {
  const p = packageLines(
    pkg({ official_gov_fee_amount: 131, official_gov_fee_currency: "USD", official_gov_fee_verified: true }),
    "en",
  );
  const gov = p.lines.find((l) => l.kind === "government");
  const svc = p.lines.find((l) => l.kind === "service");
  assert.equal(gov?.amount, 131);
  assert.equal(gov?.verified, true);
  assert.equal(svc?.amount, 75);
  // Only the service fee is collectable here; the government fee is paid to the government.
  assert.equal(p.payableNow, 75);
  assert.equal(p.currency, "USD");
});

test("unverified government fee is labelled, third-party costs stay a note", () => {
  const p = packageLines(
    pkg({
      official_gov_fee_amount: 131,
      official_gov_fee_currency: "USD",
      official_gov_fee_verified: false,
      third_party_costs_en: "VFS appointment fee paid at the centre",
    }),
    "en",
  );
  const gov = p.lines.find((l) => l.kind === "government")!;
  assert.equal(gov.verified, false);
  assert.match(gov.label, /not yet verified/i);
  const note = p.lines.find((l) => l.kind === "third_party_note")!;
  assert.equal(note.amount, null);
  assert.match(note.label, /VFS/);
});

test("package slug is URL-safe and deterministic", () => {
  assert.equal(slugifyPackage("Canada Tourist — Premium Package!"), "canada-tourist-premium-package");
  assert.ok(slugifyPackage("").startsWith("package-"));
});

// --- migration 0008 invariants ---------------------------------------------

const MIG = "supabase/migrations/0008_aviation_reference.sql";
const sql = readFileSync(MIG, "utf8");

test("0008: RLS enabled on all eight new tables", () => {
  const loop = sql.match(/foreach t in array array\[([\s\S]*?)\]\s*loop\s*execute format\('alter table public\.%I enable row level security/);
  assert.ok(loop, "enable-RLS DO loop must exist");
  for (const t of [
    "airlines", "airline_routes", "fare_observations", "service_corridors",
    "preferred_airports", "visa_packages", "airport_distance_cache", "airport_import_batches",
  ]) {
    assert.ok(loop[1].includes(`'${t}'`), `${t} missing from enable-RLS list`);
  }
});

test("0008: unverified routes and drafts are never public", () => {
  assert.match(sql, /create policy routes_public_read on public\.airline_routes for select\s*\n?\s*using \(operating_status in \('current','seasonal'\) or public\.is_staff\(\)\)/);
  assert.match(sql, /create policy fare_obs_public_read on public\.fare_observations for select\s*\n?\s*using \(verification_status = 'published' or public\.is_staff\(\)\)/);
  assert.match(sql, /create policy visa_packages_public_read on public\.visa_packages for select\s*\n?\s*using \(status = 'published' or public\.is_staff\(\)\)/);
});

test("0008: route verification trigger refuses current/seasonal without reviewer", () => {
  assert.match(sql, /Route must record verified_by and verified_at to become/);
});

test("0008: fare review trigger requires reviewer identity on decisions", () => {
  assert.match(sql, /A review decision must record reviewed_by and reviewed_at/);
  assert.match(sql, /A decided fare observation cannot re-enter the draft\/review state/);
});

test("0008: distance cache is canonical per ordered pair", () => {
  assert.match(sql, /constraint distance_cache_canonical_pair unique \(origin_airport_id, destination_airport_id\)/);
});

test("0008: airport import cannot overwrite admin verification state", () => {
  assert.match(sql, /verification_status text not null default 'unverified'/);
  // The generated seed's upsert must not touch verification columns:
  const seed = readFileSync("supabase/seed/airports.sql", "utf8");
  assert.match(seed, /on conflict \(ident\) do update set/);
  assert.doesNotMatch(seed, /verification_status = excluded/);
  assert.match(seed, /data_source/);
});

test("0008: negative prices and self-routes are impossible at the schema level", () => {
  assert.match(sql, /observed_price numeric\(12,2\) not null check \(observed_price >= 0\)/);
  assert.match(sql, /constraint airline_routes_no_self_route check \(origin_airport_id <> destination_airport_id\)/);
  assert.match(sql, /constraint corridor_not_self check \(origin_country_id <> destination_country_id\)/);
});
