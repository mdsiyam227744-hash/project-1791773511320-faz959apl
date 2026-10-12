"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const schema = z.object({
  full_name: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  country_iso2: z.string().trim().length(2).optional().or(z.literal("")),
  locale: z.enum(["en", "bn"]),
});

export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  const parsed = schema.safeParse({
    full_name: formData.get("full_name") ?? "",
    phone: formData.get("phone") ?? "",
    city: formData.get("city") ?? "",
    country_iso2: formData.get("country_iso2") ?? "",
    locale: formData.get("locale") ?? "en",
  });
  if (!parsed.success) return;

  const supabase = createClient();
  let countryId: string | null = null;
  if (parsed.data.country_iso2) {
    const { data } = await supabase
      .from("countries")
      .select("id")
      .eq("iso2", parsed.data.country_iso2.toUpperCase())
      .maybeSingle();
    countryId = data?.id ?? null;
  }

  await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name || null,
      phone: parsed.data.phone || null,
      city: parsed.data.city || null,
      country_id: countryId,
      locale: parsed.data.locale,
    })
    .eq("id", user.id);

  revalidatePath("/account/profile");
  revalidatePath("/account");
}
