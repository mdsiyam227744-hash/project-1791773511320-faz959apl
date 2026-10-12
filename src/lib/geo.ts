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
