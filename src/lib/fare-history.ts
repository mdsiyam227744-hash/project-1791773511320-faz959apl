/**
 * Pure fare-history import logic: city normalisation, city→country mapping,
 * country-pair fare-reference aggregation, and derived round-trip references.
 *
 * Dependency-free so the plain Node test runner can pin every rule. The
 * loader script (scripts/load-fare-history.mjs) feeds it rows from the
 * published flight-fare-history dataset (CC-BY-4.0) and emits SQL.
 *
 * Honesty rules enforced here:
 *  - A city name that maps to more than one country is AMBIGUOUS: it goes to
 *    the review queue, never guessed.
 *  - A city name that matches no airport municipality is UNMATCHED: review
 *    queue, never guessed.
 *  - Original EUR values are always preserved; conversion happens at display
 *    time through the documented rate table, never at import.
 *  - A derived round-trip reference is the SUM OF TWO OBSERVED ONE-WAY
 *    MEDIANS — labelled derived, never presented as an observed return fare.
 *  - Domestic city routes (same country) never produce country-pair
 *    references; the worldwide matrix is international pairs only.
 */

// ---------------------------------------------------------------------------
// City-name normalisation (documented, deterministic, applied to BOTH sides)
// ---------------------------------------------------------------------------

/** NFD-strip diacritics, lowercase, unify apostrophes, collapse whitespace. */
export function normalizeCityName(raw: string): string {
  let s = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[’‘`´]/g, "'").toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  return s;
}

/**
 * Alias reduction for known systematic suffix differences between the fare
 * dataset and airport municipalities. Ordered; first match wins.
 */
const CITY_ALIAS_RULES: { suffix: RegExp; replacement: string }[] = [
  { suffix: / city$/, replacement: "" }, // "Jeju City" → "jeju"
  { suffix: / islands?$/, replacement: "" }, // "Phu Quoc Island" → "phu quoc"
  { suffix: / new$/, replacement: "" }, // "York New" style suffixes some feeds use
];

export function cityAliases(raw: string): string[] {
  const base = normalizeCityName(raw);
  const out = new Set<string>([base]);
  for (const rule of CITY_ALIAS_RULES) {
    if (rule.suffix.test(base)) out.add(base.replace(rule.suffix, "").trim());
  }
  return [...out].filter((s) => s.length >= 2);
}

// ---------------------------------------------------------------------------
// City → country index built from the airport database seed
// ---------------------------------------------------------------------------

export interface CityCountryIndex {
  /** normalised city name → country codes serving it (with airport counts) */
  byCity: Map<string, Map<string, number>>;
  /** distinct airport rows consumed */
  airports: number;
}

export function buildCityCountryIndex(
  rows: { city: string | null; isoCountry: string }[],
): CityCountryIndex {
  const byCity = new Map<string, Map<string, number>>();
  let airports = 0;
  for (const r of rows) {
    if (!r.city) continue;
    const iso = r.isoCountry.toUpperCase();
    if (!/^[A-Z]{2}$/.test(iso)) continue;
    airports++;
    for (const key of cityAliases(r.city)) {
      let countries = byCity.get(key);
      if (!countries) {
        countries = new Map<string, number>();
        byCity.set(key, countries);
      }
      countries.set(iso, (countries.get(iso) ?? 0) + 1);
    }
  }
  return { byCity, airports };
}

export type CityMatchKind = "unique" | "ambiguous" | "unmatched";

export interface CityMatch {
  kind: CityMatchKind;
  /** every country the name could mean (sorted); length 1 only when unique */
  countries: string[];
}

/** Map a dataset city name to country codes; ambiguity is reported, not resolved. */
export function matchCityToCountries(index: CityCountryIndex, datasetCity: string): CityMatch {
  const aliases = cityAliases(datasetCity);
  const merged = new Map<string, number>();
  let matchedAnyAlias = false;
  for (const key of aliases) {
    const countries = index.byCity.get(key);
    if (!countries) continue;
    matchedAnyAlias = true;
    for (const [iso, n] of countries) merged.set(iso, (merged.get(iso) ?? 0) + n);
  }
  if (!matchedAnyAlias) return { kind: "unmatched", countries: [] };
  const sorted = [...merged.keys()].sort();
  // Ambiguity rule: consider only airports with scheduled service OR any
  // airport — here we keep it strict: every distinct country counts. Names
  // shared by two countries (e.g. "San Jose", "Guangzhou" metro data errors)
  // are ambiguous and need a human decision.
  if (sorted.length === 1) return { kind: "unique", countries: sorted };
  return { kind: "ambiguous", countries: sorted };
}

// ---------------------------------------------------------------------------
// Country-pair aggregation from matched city-route rows
// ---------------------------------------------------------------------------

export interface RouteCsvRow {
  originCity: string;
  destinationCity: string;
  observations: number;
  medianEur: number;
  minEur: number;
  departureMonths: number;
  firstObserved: string; // YYYY-MM-DD
  lastObserved: string; // YYYY-MM-DD
}

export interface MonthCsvRow {
  originCity: string;
  destinationCity: string;
  departureMonth: string; // YYYY-MM
  observations: number;
  medianEur: number;
  p10Eur: number;
  minEur: number;
}

export interface MatchedRoute extends RouteCsvRow {
  originIso: string;
  destinationIso: string;
}

export interface CountryPairFareRef {
  originIso: string;
  destinationIso: string;
  /** lowest per-route minimum across all matched city routes (EUR) */
  lowestObservedEur: number;
  /** the city pair that produced the lowest value (transparency) */
  lowestCityPair: string;
  /** median of the CONTRIBUTING route — shown separately, never merged in */
  medianOfContributingRouteEur: number;
  /** sum of observations across all matched city routes */
  totalObservations: number;
  firstObserved: string;
  lastObserved: string;
  /** number of distinct city routes supporting this pair */
  cityRouteCount: number;
  fareKind: "observed_one_way_history";
  currency: "EUR";
}

/**
 * Aggregate matched routes into per-country-pair one-way references.
 * Domestic routes (same ISO pair) are skipped — the matrix is international.
 */
export function aggregateCountryPairRefs(matched: MatchedRoute[]): CountryPairFareRef[] {
  const byPair = new Map<string, MatchedRoute[]>();
  for (const r of matched) {
    if (r.originIso === r.destinationIso) continue; // domestic — not a country pair
    const key = `${r.originIso}>${r.destinationIso}`;
    const list = byPair.get(key);
    if (list) list.push(r);
    else byPair.set(key, [r]);
  }
  const refs: CountryPairFareRef[] = [];
  for (const [key, routes] of byPair) {
    const [originIso, destinationIso] = key.split(">");
    let best: MatchedRoute | null = null;
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
      originIso,
      destinationIso,
      lowestObservedEur: best.minEur,
      lowestCityPair: `${best.originCity} → ${best.destinationCity}`,
      medianOfContributingRouteEur: best.medianEur,
      totalObservations: totalObs,
      firstObserved: first,
      lastObserved: last,
      cityRouteCount: routes.length,
      fareKind: "observed_one_way_history",
      currency: "EUR",
    });
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Derived round-trip references
// ---------------------------------------------------------------------------

export interface DerivedRoundTrip {
  originIso: string;
  destinationIso: string;
  /** sum of the two directional one-way MEDIANS (EUR, preserved original) */
  derivedEur: number;
  outboundMedianEur: number;
  inboundMedianEur: number;
  method: "derived_round_trip_reference";
  sources: { originIso: string; destinationIso: string; medianEur: number; lastObserved: string }[];
}

/**
 * Build derived round-trip references where BOTH directions of a pair have
 * observations. Never fabricated: missing direction → no derived value.
 * Never applied to domestic pairs.
 */
export function deriveRoundTrips(refs: CountryPairFareRef[]): DerivedRoundTrip[] {
  const byKey = new Map<string, CountryPairFareRef>();
  for (const r of refs) byKey.set(`${r.originIso}>${r.destinationIso}`, r);
  const out: DerivedRoundTrip[] = [];
  for (const r of refs) {
    const reverse = byKey.get(`${r.destinationIso}>${r.originIso}`);
    if (!reverse) continue;
    if (`${r.originIso}>${r.destinationIso}` >= `${r.destinationIso}>${r.originIso}`) {
      continue; // emit once per unordered pair, from the lexicographically first side
    }
    const outbound = r.medianOfContributingRouteEur;
    const inbound = reverse.medianOfContributingRouteEur;
    out.push({
      originIso: r.originIso,
      destinationIso: r.destinationIso,
      derivedEur: round2(outbound + inbound),
      outboundMedianEur: outbound,
      inboundMedianEur: inbound,
      method: "derived_round_trip_reference",
      sources: [
        {
          originIso: r.originIso,
          destinationIso: r.destinationIso,
          medianEur: outbound,
          lastObserved: r.lastObserved,
        },
        {
          originIso: reverse.originIso,
          destinationIso: reverse.destinationIso,
          medianEur: inbound,
          lastObserved: reverse.lastObserved,
        },
      ],
    });
  }
  return out;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Matrix enumeration (worldwide country-pair generation)
// ---------------------------------------------------------------------------

/**
 * Distinct ordered country pairs (A→B, A≠B) from a list of ISO-2 codes —
 * the export market convention for flight searches. Deduplicated by
 * construction; self-pairs excluded (domestic routes are out of scope).
 */
export function generateCountryPairs(isoCodes: string[]): { originIso: string; destinationIso: string }[] {
  const clean = [
    ...new Set(
      isoCodes
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^[A-Z]{2}$/.test(c)),
    ),
  ].sort();
  const pairs: { originIso: string; destinationIso: string }[] = [];
  for (let i = 0; i < clean.length; i++) {
    for (let j = 0; j < clean.length; j++) {
      if (i === j) continue;
      pairs.push({ originIso: clean[i], destinationIso: clean[j] });
    }
  }
  return pairs;
}
