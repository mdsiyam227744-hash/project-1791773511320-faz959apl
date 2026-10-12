import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdminAudit() {
  await requireStaff(["super_admin", "application_manager"]);
  const supabase = createClient();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("id, action, entity, entity_id, details, created_at, staff:staff(display_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <h1 className="text-2xl font-bold">Audit log</h1>
      <p className="mt-1 text-sm text-navy-600">
        Administrative grants, revocations, and security-relevant actions. Secrets are never
        recorded here.
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-navy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-navy-50 text-left text-navy-600">
              <th className="px-4 py-2.5">When</th>
              <th className="px-4 py-2.5">Actor</th>
              <th className="px-4 py-2.5">Action</th>
              <th className="px-4 py-2.5">Entity</th>
              <th className="px-4 py-2.5">Details</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).map((l) => (
              <tr key={l.id} className="border-b border-navy-100 last:border-0">
                <td className="px-4 py-2.5 text-xs">{new Date(l.created_at).toLocaleString("en-GB")}</td>
                <td className="px-4 py-2.5">{l.staff?.display_name ?? "system"}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{l.action}</td>
                <td className="px-4 py-2.5 text-xs">{l.entity ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{l.details ? JSON.stringify(l.details) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(logs ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-navy-500">No audit entries yet.</p>
        ) : null}
      </div>
    </div>
  );
}
