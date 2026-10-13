/**
 * Geodesic distance and flight-offer mapping helpers.
 * Dependency-free so it can be unit-tested with the plain Node test runner.
 * The Amadeus API client lives in flights.ts; this module holds the pure parts.
 */

export interface FlightQuote {
  airline: string;
  price: number;
  currency: string;
  stops: number;
}

const R_EARTH_KM = 6371;

/** IATA-code/date validation shared by the API route, the provider client, and tests. */
export type FlightSearchFailureReason =
  | "flights_provider_not_configured"
  | "flights_provider_auth_failed"
  | "flights_provider_error"
  | "flights_rate_limited"
  | "invalid_route"
  | "invalid_params";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pure validation of a flight-search request. Returns the first failure
 * reason, or null when the request is well-formed. Same-airport routes are
 * rejected before any provider call.
 */
export function validateFlightSearchParams(opts: {
  originIata: string;
  destinationIata: string;
  date: string;
  returnDate?: string | null;
}): FlightSearchFailureReason | null {
  if (
    !/^[A-Z]{3}$/.test(opts.originIata) ||
    !/^[A-Z]{3}$/.test(opts.destinationIata) ||
    !ISO_DATE.test(opts.date)
  ) {
    return "invalid_params";
  }
  if (opts.originIata === opts.destinationIata) return "invalid_route";
  if (opts.returnDate) {
    if (!ISO_DATE.test(opts.returnDate)) return "invalid_params";
    if (opts.returnDate < opts.date) return "invalid_params";
  }
  return null;
}

/** Great-circle distance in km between two coordinate pairs (pure function). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(a));
}

/**
 * Maps one provider flight-offer record to a quote. Pure — exported for tests.
 * Never invents values: missing prices map to 0 and missing carriers to "—".
 */
export function mapOffer(offer: unknown): FlightQuote {
  const o = offer as {
    price?: { grandTotal?: string; total?: string; currency?: string };
    itineraries?: { segments?: { carrierCode?: string }[] }[];
  };
  const itineraries = o.itineraries ?? [];
  const segments = itineraries.flatMap((it) => it.segments ?? []);
  const price = Number(o.price?.grandTotal ?? o.price?.total ?? 0);
  return {
    airline: segments[0]?.carrierCode ?? "—",
    price: Number.isFinite(price) ? price : 0,
    currency: o.price?.currency ?? "USD",
    stops: Math.max(0, segments.length - itineraries.length),
  };
}
