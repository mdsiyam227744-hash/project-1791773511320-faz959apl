"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const schema = z.object({
  application_id: z.string().uuid(),
  status: z.string().min(2).max(40),
  assigned_staff_id: z.string().uuid().optional().or(z.literal("")),
  status_note: z.string().trim().max(2000).optional().or(z.literal("")),
});

/**
 * Staff update of an application. RLS permits staff writes; we still verify the
 * actor is active staff server-side before touching the row, and the status
 * history trigger records the change with the acting user.
 */
export async function updateApplication(formData: FormData) {
  const { staff } = await requireStaff();
  const parsed = schema.safeParse({
    application_id: formData.get("application_id"),
    status: formData.get("status"),
    assigned_staff_id: formData.get("assigned_staff_id") ?? "",
    status_note: formData.get("status_note") ?? "",
  });
  if (!parsed.success) return;

  const supabase = createClient();
  await supabase
    .from("applications")
    .update({
      status: parsed.data.status,
      assigned_staff_id: parsed.data.assigned_staff_id || null,
      status_note: parsed.data.status_note || null,
    })
    .eq("id", parsed.data.application_id);

  revalidatePath("/admin/applications");
  void staff;
}
