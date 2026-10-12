"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const schema = z.object({
  consultation_id: z.string().uuid(),
  status: z.enum(["new", "contacted", "scheduled", "converted", "closed"]),
});

export async function updateConsultation(formData: FormData) {
  await requireStaff();
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const supabase = createClient();
  await supabase
    .from("consultation_requests")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.consultation_id);
  revalidatePath("/admin/consultations");
}
