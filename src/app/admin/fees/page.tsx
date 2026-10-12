import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateServiceFee } from "./actions";

/**
 * Pricing management: super_admin + application_manager only (enforced in
 * requireStaff and again by RLS). Official government fees are NOT edited here —
 * those live on visa listings with source URLs and verification dates.
 */
export default async function AdminFees() {
  const { staff } = await requireStaff(["super_admin", "application_manager"]);
  const supabase = createClient();

  const [{ data: fees }, { data: history }] = await Promise.all([
    supabase.from("service_fees").select("*").order("key"),
    supabase
      .from("service_fee_history")
      .select("service_fee_id, previous_amount, new_amount, currency, created_at, changed_by, staff:staff(display_name)")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Pricing — company service fees</h1>
      <p className="mt-1 max-w-2xl text-sm text-navy-600">
        These are <strong>our</strong> fees, charged in addition to official government fees.
        Government fees are managed on each visa listing with their source and verification date and
        can never be edited here.
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-navy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-navy-50 text-left text-navy-600">
              <th className="px-4 py-2.5">Fee</th>
              <th className="px-4 py-2.5">Amount</th>
              <th className="px-4 py-2.5">Currency</th>
              <th className="px-4 py-2.5">Active</th>
              <th className="px-4 py-2.5">Update</th>
            </tr>
          </thead>
          <tbody>
            {(fees ?? []).map((f) => (
              <tr key={f.id} className="border-b border-navy-100 last:border-0">
                <td className="px-4 py-3">
                  {f.label_en}
                  <p className="text-xs text-navy-400">{f.key}</p>
                </td>
                <td className="px-4 py-3 font-mono">{f.amount}</td>
                <td className="px-4 py-3">{f.currency}</td>
                <td className="px-4 py-3 text-xs">{f.active ? "yes" : "no"}</td>
                <td className="px-4 py-3">
                  <form action={updateServiceFee} className="flex items-center gap-1">
                    <input type="hidden" name="fee_id" value={f.id} />
                    <input
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={f.amount}
                      className="w-24 rounded border border-navy-200 px-2 py-1 text-xs"
                      aria-label="New amount"
                    />
                    <select name="active" defaultValue={String(f.active)} className="rounded border border-navy-200 px-1 py-1 text-xs" aria-label="Active">
                      <option value="true">active</option>
                      <option value="false">inactive</option>
                    </select>
                    <button className="rounded bg-[var(--brand-primary)] px-2 py-1 text-xs font-semibold text-white">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Change history</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {(history ?? []).map((h) => (
            <li key={`${h.service_fee_id}-${h.created_at}`} className="rounded border border-navy-100 bg-white px-3 py-2">
              {h.staff?.display_name ?? "—"} changed a fee {h.previous_amount} →{" "}
              <strong>{h.new_amount}</strong> {h.currency} ·{" "}
              {new Date(h.created_at).toLocaleString("en-GB")}
            </li>
          ))}
          {(history ?? []).length === 0 ? (
            <li className="text-navy-500">No fee changes recorded yet.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
