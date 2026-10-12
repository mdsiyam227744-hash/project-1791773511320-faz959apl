import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STAFF_ROLE_LABELS, ROLE_GRANT_MATRIX, type UserRole } from "@/lib/auth";
import { grantStaff, revokeStaff } from "./actions";

/**
 * Staff & roles. Only super_admin (or application_manager for its subordinate
 * roles) may grant; the DB RPC re-checks this independently of the UI.
 */
export default async function AdminStaff() {
  const { staff } = await requireStaff();
  const supabase = createClient();

  const [{ data: roster }, { data: candidates }] = await Promise.all([
    supabase.from("staff").select("id, display_name, role, is_active").order("created_at"),
    // Customer profiles are candidates for staff roles (never self-service).
    supabase.from("profiles").select("id, full_name").order("created_at", { ascending: false }).limit(50),
  ]);

  const grantable = ROLE_GRANT_MATRIX[staff.role as UserRole];

  return (
    <div>
      <h1 className="text-2xl font-bold">Staff &amp; roles</h1>
      <p className="mt-1 text-sm text-navy-600">
        You are signed in as <strong>{STAFF_ROLE_LABELS[staff.role as UserRole]}</strong>. You can
        grant: {grantable.length > 0 ? grantable.map((r) => STAFF_ROLE_LABELS[r]).join(", ") : "none"}.
        All grants are enforced again by the database and written to the audit log.
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-navy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-navy-50 text-left text-navy-600">
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(roster ?? []).map((s) => (
              <tr key={s.id} className="border-b border-navy-100 last:border-0">
                <td className="px-4 py-2.5 font-medium">{s.display_name}</td>
                <td className="px-4 py-2.5">{STAFF_ROLE_LABELS[s.role as UserRole]}</td>
                <td className="px-4 py-2.5 text-xs">{s.is_active ? "active" : "inactive"}</td>
                <td className="px-4 py-2.5">
                  {staff.role === "super_admin" ? (
                    <form action={revokeStaffActionWrapper}>
                      <input type="hidden" name="user_id" value={s.id} />
                      <button className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                        Revoke access
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-navy-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {(roster ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-navy-500">
                  No staff yet. Grant the first role below.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {grantable.length > 0 ? (
        <section className="mt-8 max-w-xl">
          <h2 className="text-lg font-semibold">Grant a staff role</h2>
          <p className="mt-1 text-xs text-navy-500">
            The person must already have a customer account (registered with email + password).
          </p>
          <form action={grantStaffActionWrapper} className="mt-3 space-y-3 rounded-lg border border-navy-100 bg-white p-5">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Customer</span>
              <select name="user_id" required className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm">
                {candidates
                  ?.filter((c) => !(roster ?? []).some((r) => r.id === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name || c.id}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Role</span>
              <select name="role" required className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm">
                {grantable.map((r) => (
                  <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>
                ))}
              </select>
            </label>
            <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white">
              Grant role
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

async function grantStaffActionWrapper(formData: FormData) {
  "use server";
  await grantStaff(formData);
}

async function revokeStaffActionWrapper(formData: FormData) {
  "use server";
  await revokeStaff(formData);
}
