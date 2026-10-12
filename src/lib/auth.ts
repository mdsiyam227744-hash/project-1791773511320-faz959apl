import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { STAFF_ROLE_LABELS, ROLE_GRANT_MATRIX, type UserRole } from "./auth-types";

export { STAFF_ROLE_LABELS, ROLE_GRANT_MATRIX };
export type { UserRole };

export interface StaffRecord {
  id: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
}

export async function getSessionUser() {
  // When the platform has no connected database, fail closed with null instead of
  // throwing — every caller (guards, API routes, staffish) already treats null as
  // "not signed in", so authenticated surfaces degrade to the public site plus a
  // login form instead of crashing.
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile(userId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

export async function getStaffContext(): Promise<{ userId: string; staff: StaffRecord } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = createClient();
  const { data: staff } = await supabase
    .from("staff")
    .select("id, display_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!staff || !staff.is_active) return null;
  return { userId: user.id, staff: staff as StaffRecord };
}

/**
 * Guard for customer pages. Redirects unauthenticated visitors to login.
 */
export async function requireUser(): Promise<NonNullable<Awaited<ReturnType<typeof getSessionUser>>>> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Guard for staff pages. Redirects non-staff to their account dashboard.
 * Passing roles restricts to those roles (e.g. fees pages require super_admin
 * or application_manager). This is the application-layer boundary; the database
 * RLS layer is the second, independent boundary.
 */
export async function requireStaff(roles?: UserRole[]) {
  const context = await getStaffContext();
  if (!context) redirect("/account");
  if (roles && !roles.includes(context.staff.role)) redirect("/admin");
  return context;
}
