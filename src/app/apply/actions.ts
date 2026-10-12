"use server";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  destination_iso2: z.string().trim().length(2),
  category: z.string().trim().min(2).max(40),
  travel_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
  visa_listing_id: z.string().uuid().optional().or(z.literal("")),
});

export type ApplyState = { ok?: boolean; reference?: string; error?: string };

export async function submitApplication(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    destination_iso2: formData.get("destination_iso2"),
    category: formData.get("category"),
    travel_date: formData.get("travel_date") ?? "",
    notes: formData.get("notes") ?? "",
    visa_listing_id: formData.get("visa_listing_id") ?? "",
  });
  if (!parsed.success) return { error: "invalid" };

  if (!isSupabaseConfigured()) return { error: "unavailable" };
  const supabase = createClient();

  const { data: dest } = await supabase
    .from("countries")
    .select("id")
    .eq("iso2", parsed.data.destination_iso2.toUpperCase())
    .maybeSingle();
  if (!dest) return { error: "invalid" };

  // The reference number is generated server-side (VX-YY-######).
  const { data: ref, error: fnError } = await supabase.rpc("next_application_reference");
  if (fnError || !ref) return { error: "unavailable" };

  const { data: app, error } = await supabase
    .from("applications")
    .insert({
      reference_no: ref,
      customer_id: user.id,
      destination_country_id: dest.id,
      category_code: parsed.data.category,
      travel_date: parsed.data.travel_date || null,
      notes: parsed.data.notes || null,
      visa_listing_id: parsed.data.visa_listing_id || null,
      status: "submitted",
    })
    .select("reference_no")
    .single();

  if (error) return { error: "unavailable" };
  return { ok: true, reference: app.reference_no };
}
