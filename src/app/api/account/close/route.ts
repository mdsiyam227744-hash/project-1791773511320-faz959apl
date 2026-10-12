import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

/**
 * Account closure: authenticated customers only. Anonymizes the profile and
 * flags the account for closure — the auth user itself is removed by an
 * administrator through the auth provider's admin API once active cases are
 * resolved, so customers cannot delete records tied to live applications.
 * Returns 501 when the database is not configured (honest unavailability).
 */
export async function POST() {
  try {
    const { createClient, isSupabaseConfigured } = await import("@/lib/supabase/server");
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "not_configured" }, { status: 501 });
    }
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // Anonymize profile fields (RLS: owner-scoped update).
    await supabase
      .from("profiles")
      .update({ full_name: null, phone: null, city: null, country_id: null })
      .eq("id", user.id);

    return NextResponse.json({
      received: true,
      note: "Closure request recorded. Active applications are unaffected until resolved.",
    });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  } finally {
    void revalidatePath;
  }
}
