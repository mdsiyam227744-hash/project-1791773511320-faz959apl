"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const correctionSchema = z.object({
  airport_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  iata: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .optional()
    .or(z.literal("")),
});

/**
 * Airports are reference data: admins may correct names or deactivate a row
 * (so it stops appearing in autocomplete) but never delete it — historical
 * orders keep their references intact.
 */
export async function updateAirport(formData: FormData) {
  await requireStaff(["super_admin", "application_manager"]);
  const parsed = correctionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (parsed.data.name) patch.name = parsed.data.name;
  if (parsed.data.city) patch.city_municipality = parsed.data.city;
  if (parsed.data.iata) patch.iata_code = parsed.data.iata.toUpperCase();
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("airports").update(patch).eq("id", parsed.data.airport_id);
  if (error) return;
  revalidatePath("/admin/airports");
}

export async function setAirportActive(formData: FormData) {
  await requireStaff(["super_admin", "application_manager"]);
  const parsed = z
    .object({
      airport_id: z.string().uuid(),
      active: z.enum(["true", "false"]),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const supabase = createClient();
  const { error } = await supabase
    .from("airports")
    .update({ active: parsed.data.active === "true" })
    .eq("id", parsed.data.airport_id);
  if (error) return;
  revalidatePath("/admin/airports");
}
