/**
 * Server data access for the worldwide country-pair fare matrix and fare
 * display settings. List functions return the states fit for the caller:
 * customers only ever see verified rows; staff tools query all states.
 */
import { createClient, isSupabaseConfigured } from "./supabase/server";

export interface CountryFareRefRow {
  id: string;
  origin_iso: string;
  destination_iso: string;
  fare_kind: "observed_one_way_history" | "needs_research";
  amount: number | null;
  currency: string;
  lowest_city_pair: string | null;
  median_of_contributing_route: number | null;
  observation_count: number | null;
  supporting_city_routes: number | null;
  observation_from: string | null;
  observation_to: string | null;
  source_url: string | null;
  source_license: string | null;
  source_dataset: string | null;
  verification_status: "needs_research" | "needs_review" | "verified" | "rejected";
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string;
}

export interface DerivedRoundTripRow {
  id: string;
  origin_iso: string;
  destination_iso: string;
  derived_amount: number;
  currency: string;
  outbound_median: number;
  inbound_median: number;
  source_routes: unknown;
  observation_count: number | null;
  source_url: string | null;
  source_license: string | null;
  verification_status: "needs_review" | "verified" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  updated_at: string;
}

export interface FareMappingReviewRow {
  id: string;
  city_name: string;
  match_kind: "unmatched" | "ambiguous";
  possible_countries: string | null;
  dataset_routes: number;
  source_url: string | null;
  resolved: boolean;
  resolved_country: string | null;
  resolved_at: string | null;
}

export interface FareDisplaySettingsRow {
  display_currency: string;
  rate_to_display: number;
  rate_source: string;
  rate_as_of: string;
  enabled: boolean;
  updated_at: string;
}

const REF_SELECT = `id, origin_iso, destination_iso, fare_kind, amount, currency,
  lowest_city_pair, median_of_contributing_route, observation_count, supporting_city_routes,
  observation_from, observation_to, source_url, source_license, source_dataset,
  verification_status, review_note, reviewed_by, reviewed_at, updated_at`;

export async function listCountryFareRefs(filter: {
  originIso?: string;
  destinationIso?: string;
  status?: CountryFareRefRow["verification_status"];
  kind?: CountryFareRefRow["fare_kind"];
  limit?: number;
}): Promise<CountryFareRefRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    let q = supabase
      .from("country_fare_refs")
      .select(REF_SELECT)
      .order("updated_at", { ascending: false })
      .limit(filter.limit ?? 200);
    if (filter.originIso) q = q.eq("origin_iso", filter.originIso.toUpperCase());
    if (filter.destinationIso) q = q.eq("destination_iso", filter.destinationIso.toUpperCase());
    if (filter.status) q = q.eq("verification_status", filter.status);
    if (filter.kind) q = q.eq("fare_kind", filter.kind);
    const { data } = await q;
    return (data ?? []) as unknown as CountryFareRefRow[];
  } catch {
    return [];
  }
}

export async function getCountryFareRef(
  originIso: string,
  destinationIso: string,
): Promise<CountryFareRefRow | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("country_fare_refs")
      .select(REF_SELECT)
      .eq("origin_iso", originIso.toUpperCase())
      .eq("destination_iso", destinationIso.toUpperCase())
      .in("fare_kind", ["observed_one_way_history", "needs_research"])
      .limit(1)
      .maybeSingle();
    return (data as CountryFareRefRow) ?? null;
  } catch {
    return null;
  }
}

/** Verified one-way reference shown to customers for a pair (or null). */
export async function getPublishedPairFare(
  originIso: string,
  destinationIso: string,
): Promise<CountryFareRefRow | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("country_fare_refs")
      .select(REF_SELECT)
      .eq("origin_iso", originIso.toUpperCase())
      .eq("destination_iso", destinationIso.toUpperCase())
      .eq("fare_kind", "observed_one_way_history")
      .eq("verification_status", "verified")
      .limit(1)
      .maybeSingle();
    return (data as CountryFareRefRow) ?? null;
  } catch {
    return null;
  }
}

export async function getDerivedRoundTrip(
  originIso: string,
  destinationIso: string,
): Promise<DerivedRoundTripRow | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("derived_round_trip_refs")
      .select("*")
      .eq("origin_iso", originIso.toUpperCase())
      .eq("destination_iso", destinationIso.toUpperCase())
      .limit(1)
      .maybeSingle();
    return (data as DerivedRoundTripRow) ?? null;
  } catch {
    return null;
  }
}

export async function listDerivedRoundTrips(filter: {
  status?: DerivedRoundTripRow["verification_status"];
  limit?: number;
}): Promise<DerivedRoundTripRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    let q = supabase
      .from("derived_round_trip_refs")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(filter.limit ?? 200);
    if (filter.status) q = q.eq("verification_status", filter.status);
    const { data } = await q;
    return (data ?? []) as unknown as DerivedRoundTripRow[];
  } catch {
    return [];
  }
}

export async function listFareMappingReview(filter: {
  openOnly?: boolean;
  limit?: number;
}): Promise<FareMappingReviewRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createClient();
    let q = supabase
      .from("fare_mapping_review")
      .select("*")
      .order("dataset_routes", { ascending: false })
      .limit(filter.limit ?? 100);
    if (filter.openOnly) q = q.eq("resolved", false);
    const { data } = await q;
    return (data ?? []) as unknown as FareMappingReviewRow[];
  } catch {
    return [];
  }
}

export async function getFareDisplaySettings(): Promise<FareDisplaySettingsRow | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("fare_display_settings")
      .select("display_currency, rate_to_display, rate_source, rate_as_of, enabled, updated_at")
      .eq("id", 1)
      .maybeSingle();
    return (data as FareDisplaySettingsRow) ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Honest coverage counters — every number here comes from stored records
// ---------------------------------------------------------------------------

export interface MatrixCoverage {
  countries: number | null;
  matrixPairs: number | null;
  observedPairs: number | null;
  derivedRefs: number | null;
  needsResearchPairs: number | null;
  awaitingReview: number | null;
  verifiedPairs: number | null;
  openCityReviews: number | null;
}

export async function getMatrixCoverage(): Promise<MatrixCoverage> {
  const empty: MatrixCoverage = {
    countries: null, matrixPairs: null, observedPairs: null, derivedRefs: null,
    needsResearchPairs: null, awaitingReview: null, verifiedPairs: null, openCityReviews: null,
  };
  if (!isSupabaseConfigured()) return empty;
  try {
    const supabase = createClient();
    const countRows = async (table: string, eq?: Record<string, string | boolean>): Promise<number | null> => {
      try {
        let q = supabase.from(table).select("id", { count: "exact", head: true });
        for (const [col, val] of Object.entries(eq ?? {})) {
          q = q.eq(col, val);
        }
        const { count } = await q;
        return count ?? 0;
      } catch {
        return null;
      }
    };
    const countries = await countRows("countries", { is_origin: true, is_destination: true });
    const observed = await countRows("country_fare_refs", { fare_kind: "observed_one_way_history" });
    const needsResearch = await countRows("country_fare_refs", { fare_kind: "needs_research" });
    const awaiting = await countRows("country_fare_refs", { verification_status: "needs_review" });
    const verified = await countRows("country_fare_refs", {
      verification_status: "verified", fare_kind: "observed_one_way_history",
    });
    const derived = await countRows("derived_round_trip_refs", { verification_status: "verified" });
    const openReviews = await countRows("fare_mapping_review", { resolved: false });
    return {
      countries,
      matrixPairs: countries == null ? null : countries * Math.max(0, countries - 1),
      observedPairs: observed,
      derivedRefs: derived,
      needsResearchPairs: needsResearch,
      awaitingReview: awaiting,
      verifiedPairs: verified,
      openCityReviews: openReviews,
    };
  } catch {
    return empty;
  }
}
