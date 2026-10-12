"use server";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getSchema,
  isFormKind,
  categoryFor,
  type FormKind,
} from "@/lib/application-forms";

export type ApplyState =
  | { ok: true; reference: string; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
  | { saved: true; id: string; savedAt: string }
  | null;

const ENVELOPE = z.object({
  form_kind: z.string(),
  application_id: z.string().uuid().optional().or(z.literal("")),
  visa_listing_id: z.string().uuid().optional().or(z.literal("")),
  destination_iso2: z.string().trim().length(2),
});

/**
 * Flatten a validated Zod error into a per-field map for the form UI.
 */
function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

async function resolveCountryIds(supabase: ReturnType<typeof createClient>, iso2List: string[]) {
  const uniq = [...new Set(iso2List.map((c) => c.toUpperCase()))];
  const { data } = await supabase.from("countries").select("id, iso2").in("iso2", uniq);
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set((row.iso2 as string).toUpperCase(), row.id as string);
  return map;
}

/**
 * Saves a draft or submits a guided application.
 * - Draft: stored with status 'draft'; owner can edit freely; no reference
 *   number is exposed to staff queues (drafts show as drafts).
 * - Submit: validates the full form server-side, generates the unique
 *   reference via RPC, stamps submitted_at, and records status history.
 */
export async function saveOrSubmitApplication(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const user = await requireUser();
  if (!isSupabaseConfigured()) return { ok: false, error: "unavailable" };

  // Collect the raw payload first (needed to derive the destination ISO code,
  // which guided forms submit as the destination_country select value).
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$")) continue; // Next.js internals
    raw[key] = value;
  }

  const intent = String(formData.get("intent") ?? "submit");
  const destination_iso2 =
    String(formData.get("destination_iso2") ?? "").trim().toUpperCase() ||
    String(raw.destination_country ?? "").trim().toUpperCase();
  const parsedEnvelope = ENVELOPE.safeParse({
    form_kind: formData.get("form_kind"),
    application_id: formData.get("application_id") ?? "",
    visa_listing_id: formData.get("visa_listing_id") ?? "",
    destination_iso2,
  });
  if (!parsedEnvelope.success) return { ok: false, error: "invalid" };
  const { form_kind, application_id, visa_listing_id } = parsedEnvelope.data;
  if (!isFormKind(form_kind)) return { ok: false, error: "invalid_kind" };
  const kind: FormKind = form_kind;

  const supabase = createClient();

  // unchecked checkboxes are absent; normalize to false so Zod booleans work
  const checkboxNames = ["declaration_accuracy", "declaration_terms", "has_job_offer",
    "has_admission_offer", "has_travel_insurance", "visited_before"];
  for (const name of checkboxNames) {
    if (!(name in raw)) raw[name] = false;
  }

  if (intent === "draft") {
    // Drafts are stored unvalidated except for basic caps; the schema runs on submit.
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && v.length > 2000) return { ok: false, error: "too_long" };
      clean[k] = v;
    }
    const countryMap = await resolveCountryIds(supabase, [
      destination_iso2,
      String(raw.nationality_country ?? ""),
      String(raw.residence_country ?? ""),
    ]);
    const destId = countryMap.get(destination_iso2.toUpperCase());
    if (!destId) return { ok: false, error: "invalid" };

    if (application_id) {
      // Edit an existing draft — ownership enforced by RLS + explicit filter.
      const { data: updated, error } = await supabase
        .from("applications")
        .update({
          form_data: clean,
          form_kind: kind,
          category_code: categoryFor(kind),
          destination_country_id: destId,
          origin_country_id: countryMap.get(String(raw.nationality_country ?? "").toUpperCase())
            ?? countryMap.get(String(raw.residence_country ?? "").toUpperCase()) ?? null,
          travel_date: typeof raw.travel_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.travel_date) ? raw.travel_date : null,
          visa_listing_id: visa_listing_id || null,
          notes: typeof raw.purpose_detail === "string" ? raw.purpose_detail.slice(0, 4000) : null,
        })
        .eq("id", application_id)
        .eq("customer_id", user.id)
        .eq("status", "draft")
        .select("id")
        .maybeSingle();
      if (error || !updated) return { ok: false, error: "draft_update_failed" };
      return { saved: true, id: updated.id, savedAt: new Date().toISOString() };
    }

    const { data: created, error } = await supabase
      .from("applications")
      .insert({
        reference_no: await supabase.rpc("next_application_reference").then((r) => {
          if (r.error || !r.data) throw new Error("reference_unavailable");
          return r.data as string;
        }),
        customer_id: user.id,
        status: "draft",
        form_data: clean,
        form_kind: kind,
        category_code: categoryFor(kind),
        destination_country_id: destId,
        origin_country_id: countryMap.get(String(raw.nationality_country ?? "").toUpperCase())
          ?? countryMap.get(String(raw.residence_country ?? "").toUpperCase()) ?? null,
        travel_date: typeof raw.travel_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.travel_date) ? raw.travel_date : null,
        visa_listing_id: visa_listing_id || null,
      })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: "draft_create_failed" };
    return { saved: true, id: created.id, savedAt: new Date().toISOString() };
  }

  // ---- Submit path: full server-side validation ----
  const result = getSchema(kind).safeParse(raw);
  if (!result.success) {
    return { ok: false, error: "validation", fieldErrors: fieldErrorsFrom(result.error) };
  }

  const countryMap = await resolveCountryIds(supabase, [
    destination_iso2,
    String(raw.nationality_country ?? ""),
    String(raw.residence_country ?? ""),
  ]);
  const destId = countryMap.get(destination_iso2.toUpperCase());
  if (!destId) return { ok: false, error: "invalid" };

  const { data: ref, error: fnError } = await supabase.rpc("next_application_reference");
  if (fnError || !ref) return { ok: false, error: "unavailable" };

  const payload = {
    reference_no: ref as string,
    customer_id: user.id,
    status: "submitted" as const,
    form_data: result.data as Record<string, unknown>,
    form_kind: kind,
    category_code: categoryFor(kind),
    destination_country_id: destId,
    origin_country_id: countryMap.get(String(result.data.nationality_country ?? "").toUpperCase())
      ?? countryMap.get(String(result.data.residence_country ?? "").toUpperCase()) ?? null,
    travel_date: typeof result.data.travel_date === "string" ? result.data.travel_date : null,
    submitted_at: new Date().toISOString(),
    visa_listing_id: visa_listing_id || null,
    notes: typeof result.data.purpose_detail === "string" ? (result.data.purpose_detail as string).slice(0, 4000) : null,
  };

    if (application_id) {
      // Submitting an existing draft: ownership + draft-state enforced in the filter.
      // The draft keeps the reference number it was created with.
      const { reference_no: _keep, ...payloadWithoutRef } = payload;
      void _keep;
      const { data: updated, error } = await supabase
        .from("applications")
        .update(payloadWithoutRef)
        .eq("id", application_id)
        .eq("customer_id", user.id)
        .eq("status", "draft")
        .select("id, reference_no")
        .maybeSingle();
      if (error || !updated) return { ok: false, error: "submit_failed" };
      revalidatePath("/account");
      return { ok: true, reference: updated.reference_no, id: updated.id };
    }

  const { data: created, error } = await supabase
    .from("applications")
    .insert(payload)
    .select("id, reference_no")
    .single();
  if (error || !created) return { ok: false, error: "submit_failed" };

  revalidatePath("/account");
  return { ok: true, reference: created.reference_no, id: created.id };
}

/**
 * Deletes a draft the customer owns. Submitted applications cannot be deleted
 * by customers; they must be withdrawn through support.
 */
export async function deleteDraft(applicationId: string): Promise<boolean> {
  const user = await requireUser();
  if (!isSupabaseConfigured()) return false;
  const supabase = createClient();
  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", applicationId)
    .eq("customer_id", user.id)
    .eq("status", "draft");
  if (error) return false;
  revalidatePath("/account");
  return true;
}

export async function goToDraft(applicationId: string) {
  redirect(`/apply/guided?draft=${applicationId}`);
}
