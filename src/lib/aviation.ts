/**
 * Server-side aviation reference service: airport-pair distances (on demand
 * with a canonical cache), corridors, and preferred airports.
 *
 * Honesty rules enforced here:
 *  - Distance is great-circle between airport coordinates, labelled with the
 *    method and earth radius; never presented as flown distance or duration.
 *  - Missing/invalid coordinates produce "no distance", never a number.
 *  - A→B and B→A share one canonical cache row (symmetry by construction).
 */
import { createClient, isSupabaseConfigured } from "./supabase/server";
import { haversineKm } from "./geo";
import { checkCoordinates } from "./reference-data";

export const EARTH_RADIUS_KM = 6371.0088; // IUGG mean Earth radius (documented constant)
export const DISTANCE_METHOD = "haversine";
export const DISTANCE_METHOD_VERSION = "1";

export interface AirportGeo {
  id: string;
  ident: string;
  source_ident: string | null;
  iata_code: string | null;
  icao_code: string | null;
  name: string;
  city_municipality: string | null;
  iso_country: string;
  iso_region: string | null;
  latitude: number | null;
  longitude: number | null;
  elevation_ft: number | null;
  airport_type: string;
  scheduled_service: string | null;
  home_link: string | null;
  wikipedia_link: string | null;
  data_source: string;
  dataset_version: string | null;
  verification_status: string;
  verified_at: string | null;
  verified_by: string | null;
  data_quality_note: string | null;
  duplicate_of: string | null;
  active: boolean;
}

export interface DistanceResult {
  ok: boolean;
  distanceKm: number | null;
  method: string;
  methodVersion: string;
  earthRadiusKm: number;
  calculatedAt: string;
  reason: "no_coordinates" | "same_airport" | "not_found" | "db_unavailable" | null;
}

/** Publicly visible airports: active, usable type, real scheduled service. */
export async function listPublicAirports(filter: {
  country?: string;
  query?: string;
  type?: string;
  limit?: number;
  page?: number;
}): Promise<{ rows: AirportGeo[]; total: number | null }> {
  if (!isSupabaseConfigured()) return { rows: [], total: null };
  try {
    const supabase = createClient();
    const perPage = 25;
    const page = Math.max(1, filter.page ?? 1);
    let q = supabase
      .from("airports")
      .select("*", { count: "exact" })
      .eq("active", true)
      .in("airport_type", ["large_airport", "medium_airport", "small_airport"])
      .eq("scheduled_service", "yes")
      .order("name")
      .range((page - 1) * perPage, page * perPage - 1);
    if (filter.country) q = q.eq("iso_country", filter.country.toUpperCase());
    if (filter.type) q = q.eq("airport_type", filter.type);
    if (filter.query && filter.query.trim().length >= 2) {
      const like = `%${filter.query.trim()}%`;
      const qt = filter.query.trim();
      q = q.or(
        `name.ilike.${like},iata_code.ilike.${qt.toUpperCase()}%,icao_code.ilike.${qt.toUpperCase()}%,city_municipality.ilike.${like}`,
      );
    }
    const { data, count, error } = await q;
    if (error) return { rows: [], total: null };
    return { rows: (data ?? []) as unknown as AirportGeo[], total: count ?? null };
  } catch {
    return { rows: [], total: null };
  }
}

export async function getAirportById(id: string): Promise<AirportGeo | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase.from("airports").select("*").eq("id", id).maybeSingle();
    return (data as AirportGeo) ?? null;
  } catch {
    return null;
  }
}

/** Airports of a country — used by directory pages and the distance tool. */
export async function listAirportsByCountry(iso2: string): Promise<AirportGeo[]> {
  const { rows } = await listPublicAirports({ country: iso2, limit: 500 });
  return rows;
}

function canonicalOrder(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Airport-pair distance: computed on demand from stored coordinates, cached
 * canonically in airport_distance_cache. Never returns a fabricated number:
 * missing coordinates → ok:false with a reason.
 */
export async function airportPairDistance(
  originId: string,
  destinationId: string,
): Promise<DistanceResult> {
  const now = new Date().toISOString();
  const base: Omit<DistanceResult, "distanceKm" | "reason"> = {
    ok: false,
    method: DISTANCE_METHOD,
    methodVersion: DISTANCE_METHOD_VERSION,
    earthRadiusKm: EARTH_RADIUS_KM,
    calculatedAt: now,
  };
  if (!isSupabaseConfigured()) return { ...base, distanceKm: null, reason: "db_unavailable" };
  if (originId === destinationId) return { ...base, distanceKm: null, reason: "same_airport" };

  const supabase = createClient();
  const { data: rows } = await supabase
    .from("airports")
    .select("id, latitude, longitude")
    .in("id", [originId, destinationId]);
  const origin = (rows ?? []).find((r) => (r as { id: string }).id === originId);
  const dest = (rows ?? []).find((r) => (r as { id: string }).id === destinationId);
  if (!origin || !dest) return { ...base, distanceKm: null, reason: "not_found" };

  const oc = checkCoordinates(
    (origin as { latitude: unknown }).latitude,
    (origin as { longitude: unknown }).longitude,
  );
  const dc = checkCoordinates(
    (dest as { latitude: unknown }).latitude,
    (dest as { longitude: unknown }).longitude,
  );
  if (!oc.ok || !dc.ok) return { ...base, distanceKm: null, reason: "no_coordinates" };

  const lat1 = Number((origin as { latitude: unknown }).latitude);
  const lon1 = Number((origin as { longitude: unknown }).longitude);
  const lat2 = Number((dest as { latitude: unknown }).latitude);
  const lon2 = Number((dest as { longitude: unknown }).longitude);
  const km = haversineKm(lat1, lon1, lat2, lon2);

  // Cache canonically: smaller id is always the stored origin, so the same
  // physical pair can never occupy two rows.
  const [a, b] = canonicalOrder(originId, destinationId);
  await supabase
    .from("airport_distance_cache")
    .upsert(
      {
        origin_airport_id: a,
        destination_airport_id: b,
        distance_km: Number(km.toFixed(3)),
        method: DISTANCE_METHOD,
        method_version: DISTANCE_METHOD_VERSION,
        earth_radius_km: EARTH_RADIUS_KM,
        calculated_at: new Date().toISOString(),
      },
      { onConflict: "origin_airport_id,destination_airport_id" },
    )
    .then(() => {}, () => {});

  return {
    ok: true,
    distanceKm: km,
    method: DISTANCE_METHOD,
    methodVersion: DISTANCE_METHOD_VERSION,
    earthRadiusKm: EARTH_RADIUS_KM,
    calculatedAt: now,
    reason: null,
  };
}

/** Country-pair summary: the approved airport sets on both sides. */
export interface CountryPairSummary {
  originCountry: string;
  destCountry: string;
  originAirports: AirportGeo[];
  destAirports: AirportGeo[];
  preferredOrigin: AirportGeo | null;
  preferredDest: AirportGeo | null;
}

export async function countryPairAirports(
  originIso2: string,
  destIso2: string,
): Promise<CountryPairSummary | null> {
  const [originAirports, destAirports, preferred] = await Promise.all([
    listAirportsByCountry(originIso2),
    listAirportsByCountry(destIso2),
    Promise.all([getPreferredAirport(originIso2), getPreferredAirport(destIso2)]),
  ]);
  return {
    originCountry: originIso2.toUpperCase(),
    destCountry: destIso2.toUpperCase(),
    originAirports,
    destAirports,
    preferredOrigin: preferred[0],
    preferredDest: preferred[1],
  };
}

/** Admin-configured default airport for a country (or its first city match). */
export async function getPreferredAirport(
  countryIso2: string,
  city?: string,
): Promise<AirportGeo | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    let q = supabase
      .from("preferred_airports")
      .select("airport:airports(*)")
      .eq("country_code", countryIso2.toUpperCase())
      .limit(1);
    if (city) q = q.eq("city_municipality", city);
    const { data } = await q;
    const row = (data ?? [])[0] as unknown as { airport: AirportGeo } | undefined;
    return row?.airport ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Corridors
// ---------------------------------------------------------------------------

export interface CorridorRow {
  id: string;
  origin_country_id: string;
  destination_country_id: string;
  enabled: boolean;
  note: string | null;
  origin: { iso2: string; name_en: string };
  destination: { iso2: string; name_en: string };
}

export async function listCorridors(): Promise<CorridorRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("service_corridors")
      .select(
        "id, origin_country_id, destination_country_id, enabled, note, origin:countries!service_corridors_origin_country_id_fkey(iso2, name_en), destination:countries!service_corridors_destination_country_id_fkey(iso2, name_en)",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    return (data ?? []) as unknown as CorridorRow[];
  } catch {
    return [];
  }
}

/** Is a corridor enabled? (Used to gate corridor-scoped service display.) */
export async function isCorridorEnabled(originIso2: string, destIso2: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("service_corridors")
      .select("id")
      .eq("enabled", true)
      .eq("origin:countries!service_corridors_origin_country_id_fkey.iso2", originIso2.toUpperCase())
      .eq("destination:countries!service_corridors_destination_country_id_fkey.iso2", destIso2.toUpperCase())
      .limit(1);
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}
