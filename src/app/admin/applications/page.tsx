import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/status-pill";
import Link from "next/link";
import { updateApplication } from "./actions";
import { APP_STATUSES, ALLOWED_TRANSITIONS, STAFF_LIST } from "./shared";
import type { JoinedProfile, JoinedCountry, JoinedStaff } from "@/lib/joins";

interface AdminApplicationRow {
  id: string;
  reference_no: string;
  status: string;
  created_at: string;
  updated_at: string;
  category_code: string | null;
  form_kind: string | null;
  form_data: Record<string, unknown> | null;
  notes: string | null;
  customer: JoinedProfile | null;
  destination: JoinedCountry | null;
  assigned_staff: JoinedStaff | null;
}

export default async function AdminApplications({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireStaff();
  const { status, q } = await searchParams;
  const supabase = createClient();

  let query = supabase
    .from("applications")
    .select(
      `id, reference_no, status, created_at, updated_at, category_code, form_kind, form_data, notes,
       customer:profiles(full_name),
       destination:countries(name_en),
       assigned_staff:staff(display_name)`,
    )
    .order("updated_at", { ascending: false })
    .limit(100);
  if (status === "draft") query = query.eq("status", "draft");
  else if (status) query = query.neq("status", "draft");
  if (q) query = query.ilike("reference_no", `%${q}%`);
  const { data } = await query;
  const apps = (data ?? []) as unknown as AdminApplicationRow[];

  const { data: staffRows } = await supabase.from("staff").select("id, display_name");
  const staffList = (staffRows ?? []) as unknown as { id: string; display_name: string }[];

  return (
    <div>
      <h1 className="text-2xl font-bold">Applications</h1>

      <form method="get" className="mt-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Reference number…"
          className="rounded-md border border-navy-200 px-3 py-2 text-sm"
        />
        <select name="status" defaultValue={status ?? ""} className="rounded-md border border-navy-200 px-3 py-2 text-sm">
          <option value="">All active (drafts hidden)</option>
          <option value="draft">Drafts only</option>
          {APP_STATUSES.filter((s) => s !== "draft").map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white">
          Filter
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-navy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-navy-50 text-left text-navy-600">
              <th className="px-4 py-2.5">Reference</th>
              <th className="px-4 py-2.5">Customer</th>
              <th className="px-4 py-2.5">Destination</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Assigned</th>
              <th className="px-4 py-2.5">Manage</th>
            </tr>
          </thead>
          <tbody>
            {(apps ?? []).map((a) => (
              <tr key={a.id} className="border-b border-navy-100 align-top last:border-0">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/account/applications/${a.id}`} className="hover:underline">
                    {a.reference_no}
                  </Link>
                  <p className="font-sans text-navy-400">{new Date(a.created_at).toLocaleDateString("en-GB")}</p>
                </td>
                <td className="px-4 py-3">{a.customer?.full_name ?? "—"}</td>
                <td className="px-4 py-3">{a.destination?.name_en ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusPill status={a.status} locale="en" />
                  {a.form_kind ? (
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-navy-400">{a.form_kind}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs text-navy-600">
                  {a.assigned_staff?.display_name ?? "Unassigned"}
                </td>
                <td className="px-4 py-3">
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-navy-700">Open</summary>
                    <form action={updateApplication} className="mt-2 w-56 space-y-2">
                      <input type="hidden" name="application_id" value={a.id} />
                      <select name="status" defaultValue={a.status} className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs" aria-label="Set status">
                        {a.status === "draft"
                          ? <option value="draft">draft (customer editing)</option>
                          : [a.status, ...(ALLOWED_TRANSITIONS[a.status] ?? [])].map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                      </select>
                      <select name="assigned_staff_id" defaultValue={a.assigned_staff?.id ?? ""} className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs" aria-label="Assign staff">                        <option value="">Unassigned</option>
                        {(staffList ?? []).map((s) => (
                          <option key={s.id} value={s.id}>{s.display_name}</option>
                        ))}
                      </select>
                      <input
                        name="status_note"
                        placeholder="Note to customer (shown in their dashboard)"
                        className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs"
                      />
                      <button className="w-full rounded bg-[var(--brand-primary)] px-2 py-1.5 text-xs font-semibold text-white">
                        Update
                      </button>
                    </form>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(apps ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-navy-500">No applications match the filter.</p>
        ) : null}
      </div>

      {/* Structured answers are visible in the customer's own application page;
          the queue links straight there. */}
      <p className="mt-3 text-xs text-navy-500">
        Open an application row to manage its status, assignment, and customer note. Full form
        answers and documents are on the application page (linked from the reference number).
      </p>
    </div>
  );
}
