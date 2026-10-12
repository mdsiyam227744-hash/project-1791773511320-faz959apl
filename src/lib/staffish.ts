import { createClient } from "@/lib/supabase/server";
import { getStaffContext } from "@/lib/auth";

/**
 * Small helper for layouts that need to know whether to show an admin link.
 * Returns true only when the current user has an active staff record.
 */
export async function isStaffish(): Promise<boolean> {
  const context = await getStaffContext().catch(() => null);
  return context !== null;
}

export async function tableExists(name: string): Promise<boolean> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from(name).select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}
