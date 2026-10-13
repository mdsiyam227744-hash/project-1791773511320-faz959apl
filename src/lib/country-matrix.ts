/**
 * Pure helpers for the worldwide country-pair fare matrix. Dependency-free so
 * the Node test runner pins the behaviour (mirrored where needed by the
 * loader script — enforced by a parity test).
 */

// ---------------------------------------------------------------------------
// Matrix enumeration
// ---------------------------------------------------------------------------

export interface CountryPair {
  originIso: string;
  destinationIso: string;
}

/**
 * Distinct ordered country pairs (A→B and B→A, A≠B) from ISO-2 codes.
 * Self-pairs excluded: the international matrix has no domestic routes.
 */
export function generateCountryPairs(isoCodes: string[]): CountryPair[] {
  const clean = [
    ...new Set(
      isoCodes
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^[A-Z]{2}$/.test(c)),
    ),
  ].sort();
  const pairs: CountryPair[] = [];
  for (let i = 0; i < clean.length; i++) {
    for (let j = 0; j < clean.length; j++) {
      if (i === j) continue;
      pairs.push({ originIso: clean[i], destinationIso: clean[j] });
    }
  }
  return pairs;
}

/** Canonical unordered key so A→B and B→A share bookkeeping where needed. */
export function pairKey(a: string, b: string): string {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `${x}>${y}`;
}

// ---------------------------------------------------------------------------
// Honest display state for a country pair (customer-facing semantics)
// ---------------------------------------------------------------------------

export type CountryPairDisplayState =
  | "verified_history" // published observed one-way reference (dated window)
  | "verified_round_trip_reference" // published derived round-trip reference
  | "needs_review" // data present, awaiting an authorised reviewer
  | "needs_research" // pair known, no credible price yet — no amount exists
  | "unsupported"; // country not in the served matrix at all

export function countryPairDisplayState(input: {
  fareKind: string | null;
  verificationStatus: string | null;
  derivedStatus?: string | null;
}): CountryPairDisplayState {
  if (input.fareKind === "observed_one_way_history") {
    if (input.verificationStatus === "verified") return "verified_history";
    if (input.verificationStatus === "needs_review") return "needs_review";
    if (input.verificationStatus === "rejected") return "needs_research";
    return "needs_research";
  }
  if (input.fareKind === "needs_research") return "needs_research";
  if (input.fareKind === null && input.derivedStatus === "verified") {
    return "verified_round_trip_reference";
  }
  return "unsupported";
}

/** EUR → display-currency conversion for DISPLAY ONLY; originals stay EUR. */
export function convertForDisplay(amountEur: number, rate: number): number {
  return Math.round(amountEur * rate * 100) / 100;
}

// ---------------------------------------------------------------------------
// CSV template + row parsing for bulk agent import
// ---------------------------------------------------------------------------

export const FARE_CSV_COLUMNS = [
  "origin_iso",
  "destination_iso",
  "one_way_eur",
  "return_eur",
  "lowest_city_pair",
  "observation_from",
  "observation_to",
  "observation_count",
  "source_url",
  "source_license",
] as const;

export type FareCsvRow = Record<(typeof FARE_CSV_COLUMNS)[number], string>;

export interface FareRowIssue {
  ok: boolean;
  reason: string | null;
  /** the structured patch the row would apply (when ok) */
  patch?: {
    oneWayAmount?: number;
    returnDerivedAmount?: number;
    lowestCityPair?: string;
    observationFrom?: string;
    observationTo?: string;
    observationCount?: number;
    sourceUrl: string;
    sourceLicense: string;
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** True when the source is an http(s) URL or a named authority of the dataset. */
function validSource(s: string): boolean {
  if (/^https?:\/\//i.test(s)) {
    try {
      new URL(s);
      return true;
    } catch {
      return false;
    }
  }
  return s.trim().length >= 8; // named authority, e.g. "piratefly.com collector"
}

/**
 * Validates one bulk-import row. A row must carry at least one positive
 * amount; negative or zero amounts, bad dates, or a missing source reject the
 * row — nothing is silently repaired.
 */
export function validateFareCsvRow(row: FareCsvRow, today: string): FareRowIssue {
  const origin = (row.origin_iso ?? "").trim().toUpperCase();
  const dest = (row.destination_iso ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(origin) || !/^[A-Z]{2}$/.test(dest)) {
    return { ok: false, reason: "invalid or missing ISO country code" };
  }
  if (origin === dest) return { ok: false, reason: "domestic pair — out of matrix scope" };

  const oneWay = (row.one_way_eur ?? "").trim();
  const returnFare = (row.return_eur ?? "").trim();
  if (oneWay === "" && returnFare === "") {
    return { ok: false, reason: "no amount supplied (one_way_eur / return_eur both empty)" };
  }
  const patch: NonNullable<FareRowIssue["patch"]> = {
    sourceUrl: (row.source_url ?? "").trim(),
    sourceLicense: (row.source_license ?? "").trim(),
  };
  if (oneWay !== "") {
    const n = Number(oneWay);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: `one_way_eur must be a positive number` };
    if (!/^\d+(\.\d{1,2})?$/.test(oneWay)) return { ok: false, reason: "one_way_eur: max two decimals" };
    patch.oneWayAmount = n;
  }
  if (returnFare !== "") {
    const n = Number(returnFare);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: `return_eur must be a positive number` };
    if (!/^\d+(\.\d{1,2})?$/.test(returnFare)) return { ok: false, reason: "return_eur: max two decimals" };
    patch.returnDerivedAmount = n;
  }
  if (patch.oneWayAmount !== undefined && patch.returnDerivedAmount !== undefined) {
    if (patch.returnDerivedAmount < patch.oneWayAmount) {
      return { ok: false, reason: "return below one-way needs written justification in source_url" };
    }
  }
  const from = (row.observation_from ?? "").trim();
  const to = (row.observation_to ?? "").trim();
  if (patch.oneWayAmount !== undefined || patch.returnDerivedAmount !== undefined) {
    if (!validDate(from)) return { ok: false, reason: "observation_from must be YYYY-MM-DD" };
    if (to && !validDate(to)) return { ok: false, reason: "observation_to must be YYYY-MM-DD" };
    if (to && to < from) return { ok: false, reason: "observation_to before observation_from" };
    if (from > today) return { ok: false, reason: "observation date is in the future" };
    patch.observationFrom = from;
    if (to) patch.observationTo = to;
  }
  if (patch.oneWayAmount !== undefined) {
    const count = (row.observation_count ?? "").trim();
    if (count !== "") {
      const n = Number(count);
      if (!Number.isInteger(n) || n < 1) return { ok: false, reason: "observation_count must be a positive integer" };
      patch.observationCount = n;
    }
    const pair = (row.lowest_city_pair ?? "").trim();
    if (pair.length > 200) return { ok: false, reason: "lowest_city_pair too long" };
    if (pair) patch.lowestCityPair = pair;
  }
  if (!validSource(patch.sourceUrl)) return { ok: false, reason: "source_url required (http(s) URL or named authority)" };
  if (!patch.sourceLicense) return { ok: false, reason: "source_license required" };
  return { ok: true, reason: null, patch };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function fareRefsToCsv(
  rows: {
    origin_iso: string;
    destination_iso: string;
    fare_kind: string;
    amount: number | null;
    lowest_city_pair: string | null;
    median_of_contributing_route: number | null;
    observation_count: number | null;
    observation_from: string | null;
    observation_to: string | null;
    source_url: string | null;
    source_license: string | null;
    verification_status: string;
  }[],
): string {
  const header = [
    "origin_iso", "destination_iso", "fare_kind", "amount_eur", "lowest_city_pair",
    "median_eur", "observation_count", "observation_from", "observation_to",
    "source_url", "source_license", "verification_status",
  ].join(",");
  const lines = rows.map((r) =>
    [
      r.origin_iso, r.destination_iso, r.fare_kind,
      r.amount == null ? "" : r.amount.toFixed(2),
      r.lowest_city_pair ?? "",
      r.median_of_contributing_route == null ? "" : r.median_of_contributing_route.toFixed(2),
      r.observation_count == null ? "" : String(r.observation_count),
      r.observation_from ?? "",
      r.observation_to ?? "",
      r.source_url ?? "",
      r.source_license ?? "",
      r.verification_status,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...lines].join("\n");
}
