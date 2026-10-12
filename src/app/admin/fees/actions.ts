"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const schema = z.object({
  fee_id: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  active: z.enum(["true", "false"]),
});

/**
 * Fee updates. The history trigger records previous → new with the acting
 * user; we still require the super_admin / application_manager role here.
 */
export async function updateServiceFee(formData: FormData) {
  const { userId } = await requireStaff(["super_admin", "application_manager"]);
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const supabase = createClient();
  await supabase
    .from("service_fees")
    .update({
      amount: Number(parsed.data.amount),
      active: parsed.data.active === "true",
      updated_by: userId,
    })
    .eq("id", parsed.data.fee_id);
  revalidatePath("/admin/fees");
}
