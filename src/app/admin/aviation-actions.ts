"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  isValidIataAirlineCode,
  isValidIcaoAirportCode,
  isValidHttpUrl,
  isValidIsoDate,
  isValidAmount,
  isValidCurrency,
} from "@/lib/reference-data";

/**
 * Airlines, routes, fare observations, corridors, preferred airports,
 * and visa packages — staff-only mutations with audit logging. Route
 * verification and fare review decisions carry reviewer identity and time.
 */

const DATA_ROLES = ["super_admin", "application_manager", "content_manager"] as const;
const REVIEW_ROLES = ["super_admin", "application_manager", "content_manager"] as const;

// ---------------------------------------------------------------------------
// Airlines
// ---------------------------------------------------------------------------

const airlineSchema = z.object({
  airline_id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  iata: z.string().trim().length(2).optional().or(z.literal("")),
  icao: z.string().trim().length(3).optional().or(z.literal("")),
  country: z.string().trim().length(2).optional().or(z.literal("")),
  source_url: z.string().trim().max(400).optional().or(z.literal("")),
});

export async function saveAirline(formData: FormData) {
  const { userId } = await requireStaff([...DATA_ROLES]);
  const parsed = airlineSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;
  const payload: Record<string, unknown> = {
    name: d.name,
    iata_code: d.iata ? d.iata.toUpperCase() : null,
    icao_code: d.icao ? d.icao.toUpperCase() : null,
    country_code: d.country ? d.country.toUpperCase() : null,
    source: d.source_url ? "manual_entry" : "manual_entry",
    source_url: d.source_url || null,
  };
  if (d.iata && !isValidIataAirlineCode(d.iata.toUpperCase())) return;
  if (d.icao && !isValidIcaoAirportCode(d.icao.toUpperCase())) return;

  const supabase = createClient();
  if (d.airline_id) {
    const { error } = await supabase.from("airlines").update(payload).eq("id", d.airline_id);
    if (error) return;
    await audit(supabase, userId, "airline.updated", d.airline_id, { name: d.name });
  } else {
    const { data, error } = await supabase
      .from("airlines")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error || !data) return;
    await audit(supabase, userId, "airline.created", (data as { id: string }).id, { name: d.name });
  }
  revalidatePath("/admin/airlines");
  revalidatePath("/admin/routes");
}

export async function setAirlineVerified(formData: FormData) {
  const { userId } = await requireStaff([...DATA_ROLES]);
  const parsed = z
    .object({
      airline_id: z.string().uuid(),
      decision: z.enum(["verified", "rejected", "unverified"]),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const supabase = createClient();
  const { error } = await supabase
    .from("airlines")
    .update({
      verification_status: parsed.data.decision,
      verified_at: parsed.data.decision === "unverified" ? null : new Date().toISOString(),
      verified_by: parsed.data.decision === "unverified" ? null : userId,
    })
    .eq("id", parsed.data.airline_id);
  if (error) return;
  await audit(supabase, userId, `airline.${parsed.data.decision}`, parsed.data.airline_id, {});
  revalidatePath("/admin/airlines");
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routeSchema = z.object({
  route_id: z.string().uuid().optional(),
  origin_airport_id: z.string().uuid(),
  destination_airport_id: z.string().uuid(),
  airline_id: z.string().uuid().optional().or(z.literal("")),
  flight_no: z.string().trim().max(8).optional().or(z.literal("")),
  route_class: z.enum(["direct", "connecting"]),
  valid_from: z.string().trim().optional().or(z.literal("")),
  valid_to: z.string().trim().optional().or(z.literal("")),
  operating_days: z.string().trim().max(120).optional().or(z.literal("")),
  evidence_source: z.string().trim().min(4).max(500),
  evidence_note: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function saveRoute(formData: FormData) {
  const { userId } = await requireStaff([...DATA_ROLES]);
  const parsed = routeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;
  if (d.origin_airport_id === d.destination_airport_id) return;
  if (!isValidHttpUrl(d.evidence_source) && d.evidence_source.length < 8) return;
  if (d.valid_from && !isValidIsoDate(d.valid_from)) return;
  if (d.valid_to && !isValidIsoDate(d.valid_to)) return;

  const payload: Record<string, unknown> = {
    origin_airport_id: d.origin_airport_id,
    destination_airport_id: d.destination_airport_id,
    airline_id: d.airline_id || null,
    flight_no: d.flight_no || null,
    route_class: d.route_class,
    valid_from: d.valid_from || null,
    valid_to: d.valid_to || null,
    operating_days: d.operating_days || null,
    evidence_source: d.evidence_source,
    evidence_note: d.evidence_note || null,
    created_by: userId,
  };

  const supabase = createClient();
  if (d.route_id) {
    const { error } = await supabase.from("airline_routes").update(payload).eq("id", d.route_id);
    if (error) return;
    await audit(supabase, userId, "route.updated", d.route_id, { evidence_source: d.evidence_source });
  } else {
    const { data, error } = await supabase.from("airline_routes").insert(payload).select("id").maybeSingle();
    if (error || !data) return;
    await audit(supabase, userId, "route.created", (data as { id: string }).id, {
      origin: d.origin_airport_id,
      destination: d.destination_airport_id,
      evidence_source: d.evidence_source,
    });
  }
  revalidatePath("/admin/routes");
}

/**
 * Verify a route: publishing it as current/seasonal requires the reviewer
 * identity + timestamp (also enforced by the DB trigger).
 */
export async function verifyRoute(formData: FormData) {
  const { userId } = await requireStaff([...DATA_ROLES]);
  const parsed = z
    .object({
      route_id: z.string().uuid(),
      status: z.enum(["unverified", "current", "seasonal", "suspended", "discontinued"]),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const supabase = createClient();
  const verifying = parsed.data.status === "current" || parsed.data.status === "seasonal";
  const { error } = await supabase
    .from("airline_routes")
    .update({
      operating_status: parsed.data.status,
      verified_by: verifying ? userId : null,
      verified_at: verifying ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.route_id);
  if (error) return;
  await audit(supabase, userId, `route.${parsed.data.status}`, parsed.data.route_id, {});
  revalidatePath("/admin/routes");
}

// ---------------------------------------------------------------------------
// Fare observations
// ---------------------------------------------------------------------------

const fareSchema = z.object({
  observation_id: z.string().uuid().optional(),
  origin_airport_id: z.string().uuid(),
  destination_airport_id: z.string().uuid(),
  airline_id: z.string().uuid().optional().or(z.literal("")),
  trip_type: z.enum(["one_way", "return"]),
  cabin_class: z.enum(["economy", "premium_economy", "business", "first"]),
  travel_date_from: z.string().trim(),
  travel_date_to: z.string().trim().optional().or(z.literal("")),
  passengers: z.string().regex(/^[1-9]$/),
  observed_price: z.string(),
  taxes_included: z.enum(["true", "false"]),
  baggage_note: z.string().trim().max(200).optional().or(z.literal("")),
  currency: z.string().trim().length(3),
  journey_type: z.enum(["direct", "connecting", "unspecified"]),
  source_url: z.string().trim(),
  observation_date: z.string().trim(),
  valid_until: z.string().trim().optional().or(z.literal("")),
});

export async function saveFareObservation(formData: FormData) {
  const { userId } = await requireStaff([...DATA_ROLES]);
  const parsed = fareSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;

  if (!isValidIsoDate(d.travel_date_from)) return;
  if (d.travel_date_to && !isValidIsoDate(d.travel_date_to)) return;
  if (!isValidIsoDate(d.observation_date)) return;
  if (d.valid_until && !isValidIsoDate(d.valid_until)) return;
  if (!isValidAmount(d.observed_price)) return;
  const currency = d.currency.toUpperCase();
  if (!isValidCurrency(currency)) return;
  if (!isValidHttpUrl(d.source_url)) return;

  const payload: Record<string, unknown> = {
    origin_airport_id: d.origin_airport_id,
    destination_airport_id: d.destination_airport_id,
    airline_id: d.airline_id || null,
    trip_type: d.trip_type,
    cabin_class: d.cabin_class,
    travel_date_from: d.travel_date_from,
    travel_date_to: d.travel_date_to || null,
    passengers: Number(d.passengers),
    observed_price: d.observed_price,
    taxes_included: d.taxes_included === "true",
    baggage_note: d.baggage_note || null,
    currency,
    journey_type: d.journey_type,
    source_url: d.source_url,
    observation_date: d.observation_date,
    valid_until: d.valid_until || null,
    created_by: userId,
  };

  const supabase = createClient();
  if (d.observation_id) {
    const { error } = await supabase.from("fare_observations").update(payload).eq("id", d.observation_id);
    if (error) return;
    await audit(supabase, userId, "fare_observation.updated", d.observation_id, {});
  } else {
    const { data, error } = await supabase.from("fare_observations").insert(payload).select("id").maybeSingle();
    if (error || !data) return;
    await audit(supabase, userId, "fare_observation.created", (data as { id: string }).id, {
      source_url: d.source_url,
      observed_price: d.observed_price,
      currency,
    });
  }
  revalidatePath("/admin/fares");
}

/**
 * Review decision on a fare observation. Publishing/rejecting requires the
 * reviewer identity + time (DB trigger enforces this independently).
 */
export async function reviewFareObservation(formData: FormData) {
  const { userId } = await requireStaff([...REVIEW_ROLES]);
  const parsed = z
    .object({
      observation_id: z.string().uuid(),
      decision: z.enum(["pending_review", "published", "rejected", "withdrawn"]),
      note: z.string().trim().max(400).optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const supabase = createClient();
  const deciding = parsed.data.decision !== "pending_review";
  const { error } = await supabase
    .from("fare_observations")
    .update({
      verification_status: parsed.data.decision,
      reviewed_by: deciding ? userId : null,
      reviewed_at: deciding ? new Date().toISOString() : null,
      review_note: parsed.data.note || null,
    })
    .eq("id", parsed.data.observation_id);
  if (error) return;
  await audit(supabase, userId, `fare_observation.${parsed.data.decision}`, parsed.data.observation_id, {
    note: parsed.data.note || null,
  });
  revalidatePath("/admin/fares");
}

// ---------------------------------------------------------------------------
// Corridors
// ---------------------------------------------------------------------------

export async function setCorridor(formData: FormData) {
  const { userId } = await requireStaff([...DATA_ROLES]);
  const parsed = z
    .object({
      origin_country_id: z.string().uuid(),
      destination_country_id: z.string().uuid(),
      enabled: z.enum(["true", "false"]),
      note: z.string().trim().max(300).optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  if (parsed.data.origin_country_id === parsed.data.destination_country_id) return;

  const supabase = createClient();
  const { error } = await supabase.from("service_corridors").upsert(
    {
      origin_country_id: parsed.data.origin_country_id,
      destination_country_id: parsed.data.destination_country_id,
      enabled: parsed.data.enabled === "true",
      note: parsed.data.note || null,
      configured_by: userId,
      configured_at: new Date().toISOString(),
    },
    { onConflict: "origin_country_id,destination_country_id" },
  );
  if (error) return;
  await audit(supabase, userId, "corridor.set", `${parsed.data.origin_country_id}->${parsed.data.destination_country_id}`, {
    enabled: parsed.data.enabled === "true",
  });
  revalidatePath("/admin/corridors");
}

// ---------------------------------------------------------------------------
// Preferred airports
// ---------------------------------------------------------------------------

export async function setPreferredAirport(formData: FormData) {
  const { userId } = await requireStaff([...DATA_ROLES]);
  const parsed = z
    .object({
      country_code: z.string().trim().length(2),
      city: z.string().trim().max(120).optional().or(z.literal("")),
      airport_id: z.string().uuid(),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const supabase = createClient();
  const { error } = await supabase.from("preferred_airports").upsert(
    {
      country_code: parsed.data.country_code.toUpperCase(),
      city_municipality: parsed.data.city || null,
      airport_id: parsed.data.airport_id,
      configured_by: userId,
      configured_at: new Date().toISOString(),
    },
    { onConflict: "country_code,city_municipality" },
  );
  if (error) return;
  await audit(supabase, userId, "preferred_airport.set", parsed.data.airport_id, {
    country: parsed.data.country_code.toUpperCase(),
    city: parsed.data.city || null,
  });
  revalidatePath("/admin/corridors");
}

// ---------------------------------------------------------------------------
// Visa packages
// ---------------------------------------------------------------------------

const money = z.string().regex(/^\d+(\.\d{1,2})?$/).optional().or(z.literal(""));
const pkgText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const packageSchema = z.object({
  package_id: z.string().uuid().optional(),
  name_en: z.string().trim().min(2).max(160),
  name_bn: pkgText(160),
  description_en: pkgText(2000),
  description_bn: pkgText(2000),
  destination_country_id: z.string().uuid(),
  origin_country_id: z.string().uuid().optional().or(z.literal("")),
  category_code: z.string().trim().min(2).max(40),
  tier: z.enum(["basic", "standard", "premium"]),
  included_en: pkgText(2000),
  included_bn: pkgText(2000),
  excluded_en: pkgText(2000),
  excluded_bn: pkgText(2000),
  required_docs_en: pkgText(2000),
  required_docs_bn: pkgText(2000),
  gov_fee: money,
  gov_fee_currency: z.string().trim().length(3).optional().or(z.literal("")),
  gov_fee_verified: z.enum(["true", "false"]).optional(),
  gov_fee_source: z.string().trim().max(500).optional().or(z.literal("")),
  third_party_en: pkgText(400),
  third_party_bn: pkgText(400),
  service_fee: z.string().regex(/^\d+(\.\d{1,2})?$/),
  service_fee_currency: z.string().trim().length(3),
  tax_note: pkgText(300),
  timeline_en: pkgText(300),
  timeline_bn: pkgText(300),
  refund_en: pkgText(1000),
  refund_bn: pkgText(1000),
  eligibility_en: pkgText(1000),
  eligibility_bn: pkgText(1000),
  status: z.enum(["draft", "published", "archived"]),
  effective_from: z.string().trim().optional().or(z.literal("")),
  effective_to: z.string().trim().optional().or(z.literal("")),
});

export async function saveVisaPackage(formData: FormData) {
  const { userId } = await requireStaff(["super_admin", "application_manager"]);
  const parsed = packageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;

  const govCurrency = d.gov_fee_currency ? d.gov_fee_currency.toUpperCase() : "";
  if (d.gov_fee && !isValidAmount(d.gov_fee)) return;
  if (d.gov_fee && govCurrency && !isValidCurrency(govCurrency)) return;
  if (d.gov_fee && !govCurrency) return; // an amount must state its currency
  if (d.gov_fee_source && !isValidHttpUrl(d.gov_fee_source)) return;
  const svcCurrency = d.service_fee_currency.toUpperCase();
  if (!isValidCurrency(svcCurrency)) return;
  if (d.effective_from && !isValidIsoDate(d.effective_from)) return;
  if (d.effective_to && !isValidIsoDate(d.effective_to)) return;
  if (d.gov_fee_verified === "true" && (!d.gov_fee || !d.gov_fee_source)) {
    return; // verified requires amount + source
  }

  const payload: Record<string, unknown> = {
    name_en: d.name_en,
    name_bn: d.name_bn || null,
    description_en: d.description_en || null,
    description_bn: d.description_bn || null,
    destination_country_id: d.destination_country_id,
    origin_country_id: d.origin_country_id || null,
    category_code: d.category_code,
    tier: d.tier,
    included_services_en: d.included_en || null,
    included_services_bn: d.included_bn || null,
    excluded_services_en: d.excluded_en || null,
    excluded_services_bn: d.excluded_bn || null,
    required_documents_en: d.required_docs_en || null,
    required_documents_bn: d.required_docs_bn || null,
    official_gov_fee_amount: d.gov_fee ? d.gov_fee : null,
    official_gov_fee_currency: govCurrency || null,
    official_gov_fee_verified: d.gov_fee_verified === "true",
    official_gov_fee_source_url: d.gov_fee_source || null,
    third_party_costs_en: d.third_party_en || null,
    third_party_costs_bn: d.third_party_bn || null,
    service_fee_amount: d.service_fee,
    service_fee_currency: svcCurrency,
    tax_note: d.tax_note || null,
    timeline_en: d.timeline_en || null,
    timeline_bn: d.timeline_bn || null,
    refund_terms_en: d.refund_en || null,
    refund_terms_bn: d.refund_bn || null,
    eligibility_note_en: d.eligibility_en || null,
    eligibility_note_bn: d.eligibility_bn || null,
    status: d.status,
    effective_from: d.effective_from || null,
    effective_to: d.effective_to || null,
    updated_at: new Date().toISOString(),
  };

  const supabase = createClient();
  if (d.package_id) {
    const { error } = await supabase.from("visa_packages").update(payload).eq("id", d.package_id);
    if (error) return;
    await audit(supabase, userId, "visa_package.updated", d.package_id, { name: d.name_en, status: d.status });
  } else {
    const slugBase = d.name_en
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70);
    const slug = `${slugBase || "package"}-${Date.now().toString(36)}`;
    const { data, error } = await supabase
      .from("visa_packages")
      .insert({ ...payload, slug })
      .select("id")
      .maybeSingle();
    if (error || !data) return;
    await audit(supabase, userId, "visa_package.created", (data as { id: string }).id, {
      name: d.name_en,
      tier: d.tier,
    });
  }
  revalidatePath("/admin/packages");
}

async function audit(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  action: string,
  entityId: string,
  details: Record<string, unknown>,
) {
  await supabase
    .from("audit_logs")
    .insert({ actor_id: userId, action, entity: action.split(".")[0], entity_id: entityId, details })
    .then(() => {}, () => {});
}
