"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { validateFareCsvRow, fareRefsToCsv, type FareCsvRow } from "@/lib/country-matrix";
import { parseCsv } from "@/lib/reference-data";

/**
 * Country-pair fare matrix mutations — staff-only, audited. Review decisions
 * always carry the reviewer identity + timestamp (the DB triggers enforce the
 * same rule independently). A re-import never overwrites a decision.
 */

const EDIT_ROLES = ["super_admin", "application_manager", "content_manager"] as const;

async function audit(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  action: string,
  entityId: string,
  details: Record<string, unknown>,
) {
  await supabase
    .from("audit_logs")
    .insert({ actor_id: userId, action, entity: "country_fare_ref", entity_id: entityId, details })
    .then(() => {}, () => {});
}

function refreshMatrix() {
  revalidatePath("/admin/fares");
  revalidatePath("/admin/fare-matrix");
  revalidatePath("/flights/fares");
}

// ---------------------------------------------------------------------------
// Review decisions on observed one-way references
// ---------------------------------------------------------------------------

const reviewSchema = z.object({
  ref_id: z.string().uuid(),
  decision: z.enum(["verified", "rejected", "needs_review"]),
  note: z.string().trim().max(400).optional().or(z.literal("")),
});

export async function reviewCountryFareRef(formData: FormData) {
  const { userId } = await requireStaff([...EDIT_ROLES]);
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const deciding = parsed.data.decision !== "needs_review";

  const supabase = createClient();
  const { error } = await supabase
    .from("country_fare_refs")
    .update({
      verification_status: parsed.data.decision,
      reviewed_by: deciding ? userId : null,
      reviewed_at: deciding ? new Date().toISOString() : null,
      review_note: parsed.data.note || null,
    })
    .eq("id", parsed.data.ref_id);
  if (error) return;
  await audit(supabase, userId, `fare_ref.${parsed.data.decision}`, parsed.data.ref_id, {
    note: parsed.data.note || null,
  });
  refreshMatrix();
}

// ---------------------------------------------------------------------------
// Derived round-trip references
// ---------------------------------------------------------------------------

export async function reviewDerivedRef(formData: FormData) {
  const { userId } = await requireStaff([...EDIT_ROLES]);
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const deciding = parsed.data.decision !== "needs_review";

  const supabase = createClient();
  const { error } = await supabase
    .from("derived_round_trip_refs")
    .update({
      verification_status: parsed.data.decision === "verified" ? "verified" : parsed.data.decision === "rejected" ? "rejected" : "needs_review",
      reviewed_by: deciding ? userId : null,
      reviewed_at: deciding ? new Date().toISOString() : null,
      review_note: parsed.data.note || null,
    })
    .eq("id", parsed.data.ref_id);
  if (error) return;
  await audit(supabase, userId, `derived_ref.${parsed.data.decision}`, parsed.data.ref_id, {
    note: parsed.data.note || null,
  });
  refreshMatrix();
}

// ---------------------------------------------------------------------------
// City-name mapping resolution (ambiguous/unmatched queue)
// ---------------------------------------------------------------------------

const resolveSchema = z.object({
  review_id: z.string().uuid(),
  country: z.string().trim().length(2).optional().or(z.literal("")),
});

export async function resolveFareMapping(formData: FormData) {
  const { userId } = await requireStaff([...EDIT_ROLES]);
  const parsed = resolveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  if (!parsed.data.country) return; // resolving without a country is not a resolution

  const supabase = createClient();
  const { error } = await supabase
    .from("fare_mapping_review")
    .update({
      resolved: true,
      resolved_country: parsed.data.country.toUpperCase(),
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.review_id);
  if (error) return;
  await audit(supabase, userId, "fare_mapping.resolved", parsed.data.review_id, {
    country: parsed.data.country.toUpperCase(),
  });
  revalidatePath("/admin/fare-matrix");
}

// ---------------------------------------------------------------------------
// Planning estimate — a separate, clearly-labelled administrator figure
// ---------------------------------------------------------------------------

const estimateSchema = z.object({
  origin_iso: z.string().trim().length(2),
  destination_iso: z.string().trim().length(2),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  method: z.string().trim().min(4).max(400),
  assumptions: z.string().trim().max(400).optional().or(z.literal("")),
});

/**
 * Stores the PLANNING ESTIMATE as the needs_research row's review_note using a
 * structured marker — the amount column stays NULL so the estimate can never
 * be mistaken for, or displayed as, an observed price. The estimate is only
 * shown when an administrator has enabled estimates in display settings.
 */
export async function setPlanningEstimate(formData: FormData) {
  const { userId } = await requireStaff(["super_admin", "application_manager"]);
  const parsed = estimateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;
  if (d.origin_iso.toUpperCase() === d.destination_iso.toUpperCase()) return;

  const marker = JSON.stringify({
    kind: "planning_estimate",
    amount: Number(d.amount),
    method: d.method,
    assumptions: d.assumptions || null,
    by: userId,
    at: new Date().toISOString(),
  });

  const supabase = createClient();
  // Ensure the pair row exists (needs_research marker shape).
  await supabase
    .from("country_fare_refs")
    .upsert(
      {
        origin_iso: d.origin_iso.toUpperCase(),
        destination_iso: d.destination_iso.toUpperCase(),
        fare_kind: "needs_research",
        currency: "EUR",
        source_url: "internal:planning_estimate",
        source_license: "internal",
        verification_status: "needs_research",
      },
      { onConflict: "origin_iso,destination_iso,fare_kind" },
    )
    .then(() => {}, () => {});

  const { data: row } = await supabase
    .from("country_fare_refs")
    .select("id, review_note")
    .eq("origin_iso", d.origin_iso.toUpperCase())
    .eq("destination_iso", d.destination_iso.toUpperCase())
    .eq("fare_kind", "needs_research")
    .limit(1)
    .maybeSingle();
  if (!row) return;

  const { error } = await supabase
    .from("country_fare_refs")
    .update({ review_note: marker })
    .eq("id", (row as { id: string }).id);
  if (error) return;
  await audit(supabase, userId, "fare_ref.estimate_set", (row as { id: string }).id, {
    amount: Number(d.amount),
    method: d.method,
  });
  refreshMatrix();
}

/** Removes a planning estimate. */
export async function clearPlanningEstimate(formData: FormData) {
  const { userId } = await requireStaff(["super_admin", "application_manager"]);
  const parsed = z
    .object({ ref_id: z.string().uuid() })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const supabase = createClient();
  const { error } = await supabase
    .from("country_fare_refs")
    .update({ review_note: null })
    .eq("id", parsed.data.ref_id);
  if (error) return;
  await audit(supabase, userId, "fare_ref.estimate_cleared", parsed.data.ref_id, {});
  refreshMatrix();
}

// ---------------------------------------------------------------------------
// Public display-currency settings
// ---------------------------------------------------------------------------

const settingsSchema = z.object({
  display_currency: z.string().trim().length(3),
  rate_to_display: z.string().regex(/^\d+(\.\d{1,6})?$/),
  rate_source: z.string().trim().min(4).max(300),
  rate_as_of: z.string().trim(),
  enabled: z.enum(["true", "false"]),
});

export async function saveFareDisplaySettings(formData: FormData) {
  const { userId } = await requireStaff(["super_admin", "application_manager"]);
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.rate_as_of)) return;
  if (Number(d.rate_to_display) <= 0) return;

  const supabase = createClient();
  const { error } = await supabase.from("fare_display_settings").upsert(
    {
      id: 1,
      display_currency: d.display_currency.toUpperCase(),
      rate_to_display: d.rate_to_display,
      rate_source: d.rate_source,
      rate_as_of: d.rate_as_of,
      enabled: d.enabled === "true",
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) return;
  await audit(supabase, userId, "fare_display_settings.updated", "1", {
    currency: d.display_currency.toUpperCase(),
    rate: d.rate_to_display,
    source: d.rate_source,
    enabled: d.enabled === "true",
  });
  refreshMatrix();
}

// ---------------------------------------------------------------------------
// Bulk CSV import — validate → save accepted rows as needs_review → publish
// only through an explicit review decision. Nothing auto-publishes.
// ---------------------------------------------------------------------------

const MAX_IMPORT_ROWS = 500;

export async function importFareCsv(formData: FormData) {
  const { userId } = await requireStaff([...EDIT_ROLES]);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 4_000_000) return;
  const text = await file.text();
  const { rows, errors: parseErrors } = parseCsv(text);
  if (rows.length < 2) return;

  const header = rows[0].map((h) => h.trim());
  const idx = (col: string) => header.indexOf(col);
  for (const req of ["origin_iso", "destination_iso", "source_url", "source_license"]) {
    if (idx(req) === -1) return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const supabase = createClient();

  let accepted = 0;
  let rejected = 0;
  const rejectedSample: { line: number; reason?: string }[] = [];
  const conflicts: string[] = [];

  for (let i = 1; i < Math.min(rows.length, MAX_IMPORT_ROWS + 1); i++) {
    const raw = rows[i];
    if (raw.length === 1 && raw[0] === "") continue;
    const get = (col: string) => (idx(col) >= 0 ? (raw[idx(col)] ?? "").trim() : "");
    const row: FareCsvRow = {
      origin_iso: get("origin_iso"),
      destination_iso: get("destination_iso"),
      one_way_eur: get("one_way_eur"),
      return_eur: get("return_eur"),
      lowest_city_pair: get("lowest_city_pair"),
      observation_from: get("observation_from"),
      observation_to: get("observation_to"),
      observation_count: get("observation_count"),
      source_url: get("source_url"),
      source_license: get("source_license"),
    };
    const check = validateFareCsvRow(row, today);
    if (!check.ok || !check.patch) {
      rejected++;
      if (rejectedSample.length < 20) rejectedSample.push({ line: i + 1, reason: check.reason ?? "invalid" });
      continue;
    }
    accepted++;
    const p = check.patch;
    // One-way observations land as a needs_review observed row (or update an
    // existing one) — never published, never touching verified decisions.
    if (p.oneWayAmount !== undefined) {
      const { data: existing } = await supabase
        .from("country_fare_refs")
        .select("id, amount, verification_status")
        .eq("origin_iso", row.origin_iso)
        .eq("destination_iso", row.destination_iso)
        .eq("fare_kind", "observed_one_way_history")
        .limit(1)
        .maybeSingle();
      if (existing && (existing as { amount: number | null }).amount != null &&
          Number((existing as { amount: number | null }).amount) !== p.oneWayAmount) {
        conflicts.push(`${row.origin_iso}>${row.destination_iso} one-way ${(existing as { amount: number }).amount} → ${p.oneWayAmount}`);
      }
      const payload = {
        origin_iso: row.origin_iso,
        destination_iso: row.destination_iso,
        fare_kind: "observed_one_way_history",
        amount: p.oneWayAmount,
        currency: "EUR",
        lowest_city_pair: p.lowestCityPair ?? null,
        observation_count: p.observationCount ?? null,
        observation_from: p.observationFrom ?? null,
        observation_to: p.observationTo ?? null,
        source_url: p.sourceUrl,
        source_license: p.sourceLicense,
        source_dataset: "agent_csv_import",
      };
      if (existing) {
        await supabase
          .from("country_fare_refs")
          .update(payload)
          .eq("id", (existing as { id: string }).id)
          .in("verification_status", ["needs_review", "needs_research"]); // verified/rejected untouched
      } else {
        await supabase
          .from("country_fare_refs")
          .insert({ ...payload, verification_status: "needs_review" })
          .then(() => {}, () => {});
      }
    }
    // Return amounts are stored as DERIVED round-trip references, labelled
    // derived — an imported "return_eur" is never an observed return ticket.
    if (p.returnDerivedAmount !== undefined) {
      const { data: existingD } = await supabase
        .from("derived_round_trip_refs")
        .select("id")
        .eq("origin_iso", row.origin_iso)
        .eq("destination_iso", row.destination_iso)
        .limit(1)
        .maybeSingle();
      const payloadD = {
        origin_iso: row.origin_iso,
        destination_iso: row.destination_iso,
        fare_kind: "derived_round_trip_reference",
        derived_amount: p.returnDerivedAmount,
        currency: "EUR",
        source_routes: { imported: true, note: "agent CSV import — single figure, no directional split supplied" },
        source_url: p.sourceUrl,
        source_license: p.sourceLicense,
        source_dataset: "agent_csv_import",
      };
      if (existingD) {
        await supabase
          .from("derived_round_trip_refs")
          .update(payloadD)
          .eq("id", (existingD as { id: string }).id)
          .eq("verification_status", "needs_review");
      } else {
        await supabase
          .from("derived_round_trip_refs")
          .insert({ ...payloadD, verification_status: "needs_review" })
          .then(() => {}, () => {});
      }
    }
  }

  await supabase
    .from("audit_logs")
    .insert({
      actor_id: userId,
      action: "fare_matrix.csv_import",
      entity: "country_fare_refs",
      entity_id: file.name.slice(0, 100),
      details: {
        accepted,
        rejected,
        rejected_sample: rejectedSample,
        parse_errors: parseErrors.slice(0, 10),
        conflicts,
      },
    })
    .then(() => {}, () => {});
  refreshMatrix();
}

// ---------------------------------------------------------------------------
// CSV export of the current dataset (all states — for external review)
// ---------------------------------------------------------------------------

export async function exportFareMatrixCsv() {
  const { userId } = await requireStaff([...EDIT_ROLES]);
  if (!isSupabaseConfigured()) return { csv: "", count: 0 };
  const supabase = createClient();
  const { data } = await supabase
    .from("country_fare_refs")
    .select(
      "origin_iso, destination_iso, fare_kind, amount, lowest_city_pair, median_of_contributing_route, observation_count, observation_from, observation_to, source_url, source_license, verification_status",
    )
    .order("origin_iso")
    .limit(60000);
  const rows = (data ?? []) as unknown as Parameters<typeof fareRefsToCsv>[0];
  const csv = fareRefsToCsv(rows);
  await audit(supabase, userId, "fare_matrix.exported", "csv", { rows: rows.length });
  return { csv, count: rows.length };
}
