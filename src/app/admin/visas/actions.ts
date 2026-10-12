"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const upsertSchema = z.object({
  official_name_en: z.string().trim().min(3).max(200),
  destination_iso2: z.string().trim().length(2),
  origin_iso2: z.string().trim().length(2).optional().or(z.literal("")),
  category_code: z.string().trim().min(2).max(40),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .max(120),
  official_url: z.string().trim().url().optional().or(z.literal("")),
  processing_time_estimate: z.string().trim().max(200).optional().or(z.literal("")),
  fee_currency: z.string().trim().length(3).optional().or(z.literal("")),
  summary_en: z.string().trim().max(4000).optional().or(z.literal("")),
  eligibility_en: z.string().trim().max(4000).optional().or(z.literal("")),
  required_documents_en: z.string().trim().max(4000).optional().or(z.literal("")),
  application_steps_en: z.string().trim().max(4000).optional().or(z.literal("")),
  validity: z.string().trim().max(200).optional().or(z.literal("")),
  permitted_stay: z.string().trim().max(200).optional().or(z.literal("")),
  work_authorization: z.string().trim().max(400).optional().or(z.literal("")),
});

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function upsertVisa(formData: FormData) {
  const { userId } = await requireStaff();
  const raw = Object.fromEntries(formData.entries());
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) return;

  const supabase = createClient();
  const { data: dest } = await supabase
    .from("countries").select("id").eq("iso2", parsed.data.destination_iso2.toUpperCase()).maybeSingle();
  if (!dest) return;
  let originId: string | null = null;
  if (parsed.data.origin_iso2) {
    const { data } = await supabase
      .from("countries").select("id").eq("iso2", parsed.data.origin_iso2.toUpperCase()).maybeSingle();
    originId = data?.id ?? null;
  }

  const { error } = await supabase.from("visa_listings").upsert(
    {
      slug: slugify(parsed.data.slug),
      official_name_en: parsed.data.official_name_en,
      destination_country_id: dest.id,
      origin_country_id: originId,
      category_code: parsed.data.category_code,
      official_url: parsed.data.official_url || null,
      processing_time_estimate: parsed.data.processing_time_estimate || null,
      fee_currency: parsed.data.fee_currency?.toUpperCase() || null,
      summary_en: parsed.data.summary_en || null,
      eligibility_en: parsed.data.eligibility_en || null,
      required_documents_en: parsed.data.required_documents_en || null,
      application_steps_en: parsed.data.application_steps_en || null,
      validity: parsed.data.validity || null,
      permitted_stay: parsed.data.permitted_stay || null,
      work_authorization: parsed.data.work_authorization || null,
      status: "draft",
      verified_by: userId,
    },
    { onConflict: "slug" },
  );
  if (!error) revalidatePath("/admin/visas");
}

const statusSchema = z.object({
  visa_id: z.string().uuid(),
  status: z.enum(["draft", "published", "archived"]),
});

export async function setVisaStatus(formData: FormData) {
  const { userId } = await requireStaff();
  const parsed = statusSchema.safeParse({
    visa_id: formData.get("visa_id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;

  const supabase = createClient();
  // Refuse publishing a listing with no source URL or verification date.
  if (parsed.data.status === "published") {
    const { data } = await supabase
      .from("visa_listings")
      .select("official_url, last_verified")
      .eq("id", parsed.data.visa_id)
      .maybeSingle();
    if (!data) return;
    if (!data.official_url) return; // must cite an official source
    await supabase
      .from("visa_listings")
      .update({ last_verified: data.last_verified ?? new Date().toISOString().slice(0, 10) })
      .eq("id", parsed.data.visa_id);
  }

  await supabase
    .from("visa_listings")
    .update({ status: parsed.data.status, verified_by: userId })
    .eq("id", parsed.data.visa_id);
  revalidatePath("/admin/visas");
}
