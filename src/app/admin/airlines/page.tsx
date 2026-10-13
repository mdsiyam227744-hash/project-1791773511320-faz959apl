import { requireStaff } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { listAirlines } from "@/lib/aviation-records";
import { saveAirline, setAirlineVerified } from "../aviation-actions";

export const metadata = { title: "Airlines — Admin" };

export default async function AdminAirlinesPage() {
  await requireStaff(["super_admin", "application_manager", "content_manager", "support_agent"]);
  const configured = isSupabaseConfigured();
  const airlines = await listAirlines(false);

  return (
    <div>
      <h1 className="text-2xl font-bold">Airlines</h1>
      <p className="mt-1 max-w-3xl text-sm text-navy-600">
        Carrier records with their IATA/ICAO codes and verification state. Only verified, active airlines
        appear to customers; codes should be verified against an authoritative source before marking verified.
      </p>

      {!configured ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Database not connected yet — airline records cannot be listed or saved. This page becomes functional
          the moment the database is provisioned.
        </p>
      ) : null}

      <details className="mt-4 rounded-lg border border-navy-100 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold">Add an airline</summary>
        <form action={saveAirline} className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-xs font-medium text-navy-600">
            Name
            <input name="name" required maxLength={120} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            IATA code (2 chars)
            <input name="iata" maxLength={2} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm uppercase" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            ICAO code (3 chars)
            <input name="icao" maxLength={3} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm uppercase" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Country code
            <input name="country" maxLength={2} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm uppercase" />
          </label>
          <label className="text-xs font-medium text-navy-600 md:col-span-2">
            Source URL (where the codes were checked)
            <input name="source_url" type="url" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <div className="md:col-span-3">
            <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white">
              Save airline
            </button>
          </div>
        </form>
      </details>

      <div className="mt-6 overflow-x-auto rounded-lg border border-navy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-navy-50 text-left text-navy-600">
              <th className="px-4 py-2.5">IATA</th>
              <th className="px-4 py-2.5">ICAO</th>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">CC</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Verify</th>
            </tr>
          </thead>
          <tbody>
            {airlines.map((a) => (
              <tr key={a.id} className="border-b border-navy-100 last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{a.iata_code ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{a.icao_code ?? "—"}</td>
                <td className="px-4 py-3">{a.name}</td>
                <td className="px-4 py-3 text-xs">{a.country_code ?? "—"}</td>
                <td className="px-4 py-3 text-xs">
                  {a.verification_status === "verified" ? (
                    <span className="text-emerald-700">verified</span>
                  ) : a.verification_status === "rejected" ? (
                    <span className="text-red-700">rejected</span>
                  ) : (
                    <span className="text-navy-400">unverified</span>
                  )}
                  {!a.active ? <span className="block text-navy-400">inactive</span> : null}
                </td>
                <td className="px-4 py-3">
                  <form action={setAirlineVerified} className="flex gap-1">
                    <input type="hidden" name="airline_id" value={a.id} />
                    <button name="decision" value="verified" className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white">Verify</button>
                    <button name="decision" value="rejected" className="rounded border border-red-300 px-2 py-1 text-xs text-red-700">Reject</button>
                    <button name="decision" value="unverified" className="rounded border border-navy-200 px-2 py-1 text-xs text-navy-600">Reset</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {configured && airlines.length === 0 ? (
          <p className="p-6 text-center text-sm text-navy-500">No airlines recorded yet.</p>
        ) : null}
      </div>
    </div>
  );
}
