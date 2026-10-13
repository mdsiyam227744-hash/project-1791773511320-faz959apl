/**
 * Pure validation helpers for reference data (airports, airlines, routes,
 * fare observations). Dependency-free so the plain Node test runner can
 * exercise every rule without a database. The admin actions and API routes
 * call these; tests pin the behaviour.
 */

export type VerifyStatus = "unverified" | "verified" | "rejected";

/** ISO 3166-1 alpha-2 code shape (value validity is a data matter, not a format one). */
export function isValidCountryCode(code: string): boolean {
  return /^[A-Za-z]{2}$/.test(code);
}

/** IATA airport code: three letters, historically digits were never issued. */
export function isValidIataAirportCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

/** IATA airline code: two alphanumeric characters. */
export function isValidIataAirlineCode(code: string): boolean {
  return /^[A-Z0-9]{2}$/.test(code);
}

/** ICAO airport code: four alphanumeric characters. */
export function isValidIcaoAirportCode(code: string): boolean {
  return /^[A-Z0-9]{4}$/.test(code);
}

export interface CoordinateCheck {
  ok: boolean;
  reason: "not_a_number" | "out_of_range" | null;
}

/** Latitude ∈ [-90, 90], longitude ∈ [-180, 180]. Non-numeric input is rejected. */
export function checkCoordinates(lat: unknown, lon: unknown): CoordinateCheck {
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    // numeric strings are handled by the caller (import rows parse first)
    if (typeof lat === "string" && typeof lon === "string") {
      const latN = Number(lat);
      const lonN = Number(lon);
      if (Number.isFinite(latN) && Number.isFinite(lonN)) {
        return rangeCheck(latN, lonN);
      }
      return { ok: false, reason: "not_a_number" };
    }
    return { ok: false, reason: "not_a_number" };
  }
  return rangeCheck(lat, lon);
}

function rangeCheck(latN: number, lonN: number): CoordinateCheck {
  if (latN < -90 || latN > 90) return { ok: false, reason: "out_of_range" };
  if (lonN < -180 || lonN > 180) return { ok: false, reason: "out_of_range" };
  return { ok: true, reason: null };
}

/** ISO date YYYY-MM-DD. */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export { isValidIsoDate as isIsoDate };

const CURRENCY_RE = /^[A-Z]{3}$/;
export function isValidCurrency(code: string): boolean {
  return CURRENCY_RE.test(code);
}

export function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
    // malformed URLs throw
  } catch {
    return false;
  }
}

/** Non-negative money amount with at most two decimals. */
export function isValidAmount(s: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(s);
}

// ---------------------------------------------------------------------------
// Fare observation state machine
// ---------------------------------------------------------------------------

export type FareObservationStatus =
  | "draft" | "pending_review" | "published" | "rejected" | "expired" | "withdrawn";

export interface FareStatusTransition {
  ok: boolean;
  reason: string | null;
}

/** Allowed review-state transitions; decided rows never re-enter draft. */
export const FARE_TRANSITIONS: Record<FareObservationStatus, FareObservationStatus[]> = {
  draft: ["draft", "pending_review", "withdrawn"],
  pending_review: ["pending_review", "published", "rejected", "withdrawn"],
  published: ["published", "expired", "withdrawn"],
  rejected: ["rejected"],
  expired: ["expired"],
  withdrawn: ["withdrawn"],
};

export function canTransitionFareStatus(from: FareObservationStatus, to: FareObservationStatus): FareStatusTransition {
  const allowed = FARE_TRANSITIONS[from] ?? [];
  return allowed.includes(to)
    ? { ok: true, reason: null }
    : { ok: false, reason: `illegal transition ${from} → ${to}` };
}

/** Public fare display state, derived — never stored as opinion. */
export type FareDisplayState = "live_quote" | "indicative_current" | "pending_verification" | "expired" | "no_data";

export interface FareFreshnessInput {
  status: FareObservationStatus;
  observationDate: string; // YYYY-MM-DD
  validUntil?: string | null;
  today: string; // YYYY-MM-DD
}

/** Derives the honest display label from the stored state and dates. */
export function fareDisplayState(input: FareFreshnessInput): FareDisplayState {
  if (input.status === "published") {
    const stale =
      (input.validUntil != null && input.validUntil < input.today) ||
      (input.validUntil == null && daysBetween(input.observationDate, input.today) > 90);
    return stale ? "expired" : "indicative_current";
  }
  if (input.status === "pending_review") return "pending_verification";
  if (input.status === "expired") return "expired";
  return "no_data";
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Mirrors the DB expiry rule (valid_until < today, or 90 days unstamped). */
export function isFareObservationStale(validUntil: string | null | undefined, observationDate: string, today: string): boolean {
  if (validUntil != null && validUntil !== "") return validUntil < today;
  return daysBetween(observationDate, today) > 90;
}

// ---------------------------------------------------------------------------
// Route verification states
// ---------------------------------------------------------------------------

export type RouteOperatingStatus = "unverified" | "current" | "seasonal" | "suspended" | "discontinued";

/** Which route states are publicly shown as operating. */
export function isPubliclyOperating(status: RouteOperatingStatus): boolean {
  return status === "current" || status === "seasonal";
}

// ---------------------------------------------------------------------------
// CSV parsing (RFC 4180 subset) for the airport import
// ---------------------------------------------------------------------------

export interface ParsedCsvResult {
  rows: string[][];
  errors: { line: number; message: string }[];
}

/** Parses CSV text into rows; tolerates quoted fields and escaped quotes. */
export function parseCsv(text: string): ParsedCsvResult {
  const rows: string[][] = [];
  const errors: { line: number; message: string }[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let fieldStartLine = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        if (c === "\n") line++;
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
      fieldStartLine = line;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      line++;
    } else if (c === "\r") {
      // treat CRLF as one newline
      if (text[i + 1] !== "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        line++;
      }
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (inQuotes) errors.push({ line: fieldStartLine, message: "unterminated quoted field" });
  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Airport import row validation (shared by preview + commit)
// ---------------------------------------------------------------------------

export interface AirportImportRow {
  ident: string;
  name: string;
  iso_country: string;
  latitude: string;
  longitude: string;
  iata_code?: string;
  icao_code?: string;
  city_municipality?: string;
  iso_region?: string;
  airport_type?: string;
  scheduled_service?: string;
}

export interface AirportRowIssue {
  ok: boolean;
  reason: string | null;
}

/** Validates one import row against the dataset contract. */
export function validateAirportImportRow(row: AirportImportRow): AirportRowIssue {
  if (!row.ident || !/^[A-Za-z0-9_.\-]{1,40}$/.test(row.ident)) {
    return { ok: false, reason: "missing or invalid ident" };
  }
  if (!row.name || row.name.trim().length < 2) return { ok: false, reason: "missing name" };
  if (!isValidCountryCode(row.iso_country ?? "")) return { ok: false, reason: "invalid country code" };
  const coord = checkCoordinates(row.latitude, row.longitude);
  if (!coord.ok) return { ok: false, reason: `invalid coordinates (${coord.reason})` };
  if (row.iata_code && !isValidIataAirportCode(row.iata_code.toUpperCase())) {
    return { ok: false, reason: "invalid IATA code" };
  }
  if (row.icao_code && !isValidIcaoAirportCode(row.icao_code.toUpperCase())) {
    return { ok: false, reason: "invalid ICAO code" };
  }
  return { ok: true, reason: null };
}
