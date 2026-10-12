import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateConsultation } from "./actions";

export default async function AdminConsultations() {
  await requireStaff();
  const supabase = createClient();
  const { data: consults } = await supabase
    .from("consultation_requests")
    .select("*, customer:profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <h1 className="text-2xl font-bold">Consultations</h1>
      <div className="mt-4 space-y-3">
        {(consults ?? []).map((c) => (
          <div key={c.id} className="rounded-lg border border-navy-100 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {c.guest_name ?? c.customer?.full_name ?? "Customer"}{" "}
                  <span className="text-navy-400">· {c.guest_email ?? ""}</span>
                </p>
                <p className="text-xs text-navy-500">
                  {new Date(c.created_at).toLocaleString("en-GB")} · status: {c.status}
                </p>
              </div>
              <form action={updateConsultation} className="flex gap-1">
                <input type="hidden" name="consultation_id" value={c.id} />
                <select name="status" defaultValue={c.status} className="rounded border border-navy-200 px-2 py-1 text-xs" aria-label="Set consultation status">
                  {["new", "contacted", "scheduled", "converted", "closed"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button className="rounded bg-[var(--brand-primary)] px-2 py-1 text-xs font-semibold text-white">
                  Set
                </button>
              </form>
            </div>
            {c.message ? <p className="mt-2 text-sm text-navy-700">{c.message}</p> : null}
          </div>
        ))}
        {(consults ?? []).length === 0 ? (
          <p className="rounded-lg border border-navy-100 bg-white p-6 text-center text-sm text-navy-500">
            No consultation requests yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
