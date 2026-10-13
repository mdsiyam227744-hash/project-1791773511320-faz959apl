/**
 * Airlines, routes, and manual fare observations (server boundary).
 * Every list function returns ONLY states fit for the caller: customers see
 * verified/operating/published rows; staff tools query states explicitly.
 */
import { createClient, isSupabaseConfigured } from "./supabase/server";

export interface AirlineRow {
  id: string;
  iata_code: string | null;
  icao_code: string | null;
  name: string;
  country_code: string | null;
  active: boolean;
  verification_status: "unverified" | "verified" | "rejected";
  source: string;
  source_url: string | null;
}

export interface RouteRow {
  id: string;
  origin_airport_id: string;
  destination_airport_id: string;
  airline_id: string | null;
  flight_no: string | null;
  route_class: "direct" | "connecting";
  operating_status: "unverified" | "current" | "seasonal" | "suspended" | "discontinued";
  valid_from: string | null;
  valid_to: string | null;
  operating_days: string | null;
  evidence_source: string;
  evidence_note: string | null;
  verified_by: string | null;
  verified_at: string | null;
  origin?: { iata_code: string | null; name: string; iso_country: string };
  destination?: { iata_code: string | null; name: string; iso_country: string };
  airline?: { name: string; iata_code: string | null } | null;
}

export interface FareObservationRow {
  id: string;
  origin_airport_id: string;
  destination_airport_id: string;
  airline_id: string | null;
  trip_type: "one_way" | "return";
  cabin_class: "economy" | "premium_economy" | "business" | "first";
  travel_date_from: string;
  travel_date_to: string | null;
  passengers: number;
  observed_price: number;
  taxes_included: boolean;
  baggage_note: string | null;
  currency: string;
  journey_type: "direct" | "connecting" | "unspecified";
  source_url: string;
  observation_date: string;
  valid_until: string | null;
  verification_status: "draft" | "pending_review" | "published" | "rejected" | "expired" | "withdrawn";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  origin?: { iata_code: string | null; name: string; iso_country: string };
  destination?: { iata_code: string | null; name: string; iso_country: string };
  airline?: { name: string; iata_code: string | null } | null;
}

const ROUTE_SELECT = `id, origin_airport_id, destination_airport_id, airline_id, flight_no,
  route_class, operating_status, valid_from, valid_to, operating_days, evidence_source,
  evidence_note, verified_by, verified_at,
  origin:airports!airline_routes_origin_airport_id_fkey(iata_code, name, iso_country),
  destination:airports!airline_routes_destination_airport_id_fkey(iata_code, name, iso_country),
  airline:airlines(name, iata_code)`;

const FARE_SELECT = `id, origin_airport_id, destination_airport_id, airline_id, trip_type,
  cabin_class, travel_date_from, travel_date_to, passengers, observed_price, taxes_included,
  baggage_note, currency, journey_type, source_url, observation_date, valid_until,
  verification_status, reviewed_by, reviewed_at, review_note, created_at,
  origin:airports!fare_observations_origin_airport_id_fkey(iata_code, name, iso_country),
  destination:airports!fare_observations_destination_airport_id_fkey(iata_code, name, iso_country),
  airline:airlines(name, iata_code)`;

export async function listAirlines(onlyVerified = true): Promise<AirlineRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    let q = supabase.from("airlines").select("*").order("name").limit(500);
    if (onlyVerified) q = q.eq("verification_status", "verified").eq("active", true);
    const { data } = await q;
    return (data ?? []) as unknown as AirlineRow[];
  } catch {
    return [];
  }
}

/** Publicly shown routes: verified operating/seasonal only. */
export async function listPublicRoutes(filter: {
  originAirportId?: string;
  destinationAirportId?: string;
  limit?: number;
}): Promise<RouteRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    let q = supabase
      .from("airline_routes")
      .select(ROUTE_SELECT)
      .in("operating_status", ["current", "seasonal"])
      .order("updated_at", { ascending: false })
      .limit(filter.limit ?? 200);
    if (filter.originAirportId) q = q.eq("origin_airport_id", filter.originAirportId);
    if (filter.destinationAirportId) q = q.eq("destination_airport_id", filter.destinationAirportId);
    const { data } = await q;
    return (data ?? []) as unknown as RouteRow[];
  } catch {
    return [];
  }
}

/** Staff queue: everything, latest first. */
export async function listAllRoutes(limit = 200): Promise<RouteRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("airline_routes")
      .select(ROUTE_SELECT)
      .order("updated_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as unknown as RouteRow[];
  } catch {
    return [];
  }
}

export async function listFareObservations(filter: {
  status?: FareObservationRow["verification_status"];
  limit?: number;
}): Promise<FareObservationRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    let q = supabase
      .from("fare_observations")
      .select(FARE_SELECT)
      .order("created_at", { ascending: false })
      .limit(filter.limit ?? 200);
    if (filter.status) q = q.eq("verification_status", filter.status);
    const { data } = await q;
    return (data ?? []) as unknown as FareObservationRow[];
  } catch {
    return [];
  }
}

/** Published (customer-visible) fares for an airport pair. */
export async function listPublishedFares(
  originAirportId: string,
  destinationAirportId: string,
): Promise<FareObservationRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("fare_observations")
      .select(FARE_SELECT)
      .eq("origin_airport_id", originAirportId)
      .eq("destination_airport_id", destinationAirportId)
      .eq("verification_status", "published")
      .order("observation_date", { ascending: false })
      .limit(20);
    return (data ?? []) as unknown as FareObservationRow[];
  } catch {
    return [];
  }
}
