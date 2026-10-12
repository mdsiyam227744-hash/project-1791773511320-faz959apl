/**
 * Flight data integration boundary (Amadeus Self-Service API).
 *
 * When AMADEUS_CLIENT_ID / AMADEUS_CLIENT_SECRET are not configured, every
 * function reports { available: false, reason: "flights_provider_not_configured" }
 * and the UI shows "Live fare unavailable — request a quote." No fares are
 * ever invented. Distance uses the geodesic (great-circle) formula between city
 * coordinates and is always labelled as such — never as actual flown distance.
 */

const HOSTNAME = process.env.AMADEUS_HOSTNAME || "test.api.amadeus.com";
const BASE = `https://${HOSTNAME}`;

export interface FlightConfigStatus {
  configured: boolean;
  hostname: string;
}

export function configStatus(): FlightConfigStatus {
  return {
    configured: Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET),
    hostname: HOSTNAME,
  };
}

interface TokenCache {
  token: string;
  expiresAt: number;
}
let tokenCache: TokenCache | null = null;

export async function getAccessToken(): Promise<string | null> {
  if (!configStatus().configured) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;

  const clientId = process.env.AMADEUS_CLIENT_ID as string;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET as string;
  const res = await fetch(`${BASE}/v1/security/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return tokenCache.token;
}

export interface RouteCity {
  iataCode: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

/** IATA city lookup via the provider's reference-data endpoint. */
export async function lookupCity(keyword: string): Promise<RouteCity[]> {
  const token = await getAccessToken();
  if (!token) return [];
  const params = new URLSearchParams({
    subType: "CITY",
    keyword,
    "page[limit]": "5",
  });
  const res = await fetch(`${BASE}/v1/reference-data/locations?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data?: {
      iataCode: string;
      name: string;
      geoCode?: { latitude?: number; longitude?: number };
    }[];
  };
  return (json.data ?? []).map((d) => ({
    iataCode: d.iataCode,
    name: d.name,
    latitude: d.geoCode?.latitude ?? null,
    longitude: d.geoCode?.longitude ?? null,
  }));
}

export interface FlightQuote {
  airline: string;
  price: number;
  currency: string;
  stops: number;
}

export interface FlightSearchResult {
  available: boolean;
  reason?: string;
  quotes: FlightQuote[];
  retrievedAt: string;
  sourceUrl?: string;
}

export async function searchFlightOffers(opts: {
  originIata: string;
  destinationIata: string;
  date: string; // YYYY-MM-DD
  adults?: number;
  currency?: string;
  max?: number;
}): Promise<FlightSearchResult> {
  if (!configStatus().configured) {
    return {
      available: false,
      reason: "flights_provider_not_configured",
      quotes: [],
      retrievedAt: new Date().toISOString(),
    };
  }
  const token = await getAccessToken();
  if (!token) {
    return {
      available: false,
      reason: "flights_provider_auth_failed",
      quotes: [],
      retrievedAt: new Date().toISOString(),
    };
  }
  const params = new URLSearchParams({
    originLocationCode: opts.originIata,
    destinationLocationCode: opts.destinationIata,
    departureDate: opts.date,
    adults: String(opts.adults ?? 1),
    currencyCode: opts.currency ?? "USD",
    max: String(opts.max ?? 5),
  });
  const res = await fetch(`${BASE}/v2/shopping/flight-offers?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return {
      available: false,
      reason: "flights_provider_error",
      quotes: [],
      retrievedAt: new Date().toISOString(),
    };
  }
  const json = (await res.json()) as { data?: unknown[] };
  const quotes = (json.data ?? []).slice(0, opts.max ?? 5).map((o) => mapOffer(o));
  return {
    available: true,
    quotes,
    retrievedAt: new Date().toISOString(),
    sourceUrl: "https://amadeus.com",
  };
}

/** Pure mapping of one Amadeus flight-offer record — exported for unit tests. */
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
    price,
    currency: o.price?.currency ?? "USD",
    stops: Math.max(0, segments.length - itineraries.length),
  };
}

// Distance and offer-mapping helpers live in the pure, dependency-free geo module
// (shared with the unit tests).
export { haversineKm, mapOffer } from "./geo";
