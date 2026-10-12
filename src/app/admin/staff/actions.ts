"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const grantSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["super_admin", "application_manager", "content_manager", "support_agent"]),
});

/**
 * Grants a staff role through the database RPC, which re-validates the actor's
 * role server-side (can_grant_role) and writes an audit entry. A non-privileged
 * call fails at the database even if the UI were bypassed.
 */
export async function grantStaff(formData: FormData) {
  const { staff } = await requireStaff();
  const parsed = grantSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const matrix: Record<string, string[]> = {
    super_admin: ["super_admin", "application_manager", "content_manager", "support_agent"],
    application_manager: ["application_manager", "support_agent"],
    content_manager: [],
    support_agent: [],
  };
  if (!matrix[staff.role]?.includes(parsed.data.role)) return; // UI-level check

  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", parsed.data.user_id)
    .maybeSingle();

  await supabase.rpc("grant_staff", {
    target_user: parsed.data.user_id,
    target_name: profile?.full_name || "Staff member",
    target_role: parsed.data.role,
  });
  revalidatePath("/admin/staff");
}

const revokeSchema = z.object({ user_id: z.string().uuid() });

export async function revokeStaff(formData: FormData) {
  const { staff } = await requireStaff(["super_admin"]);
  const parsed = revokeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  if (parsed.data.user_id === staff.id) return; // cannot revoke yourself

  const supabase = createClient();
  await supabase.rpc("revoke_staff", { target_user: parsed.data.user_id });
  revalidatePath("/admin/staff");
}
