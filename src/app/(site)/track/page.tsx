import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Application tracking for a guest with a reference number. Requires the
 * reference AND the email on the application to match — no login-only access.
 */
export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; email?: string }>;
}) {
  const { ref, email } = await searchParams;
  let status: string | null = null;
  let found = false;

  if (ref && email) {
    const { createClient, isSupabaseConfigured } = await import("@/lib/supabase/server");
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      // lookup by reference + exact email of the owning account
      const { data } = await supabase
        .from("applications")
        .select("status, updated_at, profiles(email)")
        .eq("reference_no", ref.trim().toUpperCase())
        .maybeSingle();
      const ownerEmail = (data?.profiles as { email?: string } | null)?.email ?? "";
      if (data && ownerEmail.toLowerCase() === email.trim().toLowerCase()) {
        found = true;
        status = data.status;
      }
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-14">
      <h1 className="text-2xl font-bold">Track your application</h1>
      <p className="mt-2 text-sm text-navy-600">
        Enter your reference number and the email address on the application.
      </p>
      <form method="get" className="mt-6 space-y-3">
        <input
          name="ref"
          defaultValue={ref ?? ""}
          placeholder="VX-26-123456"
          className="w-full rounded-md border border-navy-200 px-3 py-2 font-mono text-sm"
          required
        />
        <input
          name="email"
          type="email"
          defaultValue={email ?? ""}
          placeholder="Email on the application"
          className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
          required
        />
        <button className="w-full rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white">
          Check status
        </button>
      </form>
      {ref && email ? (
        found ? (
          <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Application {ref?.toUpperCase()} current status: <strong>{status}</strong>. Log in to
            your dashboard for the full timeline and messages.
          </p>
        ) : (
          <p className="mt-6 rounded-lg border border-navy-100 bg-navy-50 p-4 text-sm text-navy-700">
            No application found for that reference and email combination.
          </p>
        )
      ) : null}
    </div>
  );
}
