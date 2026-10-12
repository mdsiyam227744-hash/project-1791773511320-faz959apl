"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const createSchema = z.object({
  name_en: z.string().trim().min(2).max(120),
  iso2: z.string().trim().length(2).transform((s) => s.toUpperCase()),
  nationality_en: z.string().trim().max(120).optional().or(z.literal("")),
  region: z.string().trim().max(80).optional().or(z.literal("")),
  name_bn: z.string().trim().max(120).optional().or(z.literal("")),
});

export async function createCountry(formData: FormData) {
  await requireStaff();
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const supabase = createClient();
  await supabase.from("countries").upsert(
    {
      iso2: parsed.data.iso2,
      name_en: parsed.data.name_en,
      nationality_en: parsed.data.nationality_en || null,
      region: parsed.data.region || null,
      name_bn: parsed.data.name_bn || null,
    },
    { onConflict: "iso2" },
  );
  revalidatePath("/admin/countries");
}

const toggleSchema = z.object({
  country_id: z.string().uuid(),
  field: z.enum(["is_origin", "is_destination"]),
  value: z.enum(["true", "false"]),
});

export async function toggleCountryFlags(formData: FormData) {
  await requireStaff();
  const parsed = toggleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const supabase = createClient();
  await supabase
    .from("countries")
    .update({ [parsed.data.field]: parsed.data.value === "true" })
    .eq("id", parsed.data.country_id);
  revalidatePath("/admin/countries");
}
