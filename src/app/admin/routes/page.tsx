import { requireStaff } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { listAllRoutes, listAirlines } from "@/lib/aviation-records";
import { saveRoute, verifyRoute } from "../aviation-actions";
import { AirportIdField } from "@/components/airport-id-field";

export const metadata = { title: "Routes — Admin" };

const STATUS_STYLES: Record<string, string> = {
  current: "text-emerald-700",
  seasonal: "text-sky-700",
  suspended: "text-amber-700",
  discontinued: "text-red-700",
  unverified: "text-navy-400",
};

export default async function AdminRoutesPage() {
  await requireStaff(["super_admin", "application_manager", "content_manager", "support_agent"]);
  const configured = isSupabaseConfigured();
  const routes = await listAllRoutes(100);
  const airlines = await listAirlines(false);

  return (
    <div>
      <h1 className="text-2xl font-bold">Airline routes</h1>
      <p className="mt-1 max-w-3xl text-sm text-navy-600">
        A route record is evidence-based: it exists because a source document says so, never because two
        airports exist. Only current/seasonal routes (verified with reviewer identity) are public. Marking a
        route current or seasonal requires the verification you perform here.
      </p>

      {!configured ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Database not connected yet — route records cannot be listed or saved until provisioning completes.
        </p>
      ) : null}

      <details className="mt-4 rounded-lg border border-navy-100 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold">Add a route (with source evidence)</summary>
        <form action={saveRoute} className="mt-3 grid gap-3 md:grid-cols-2">
          <AirportIdField name="origin_airport_id" label="Origin airport" />
          <AirportIdField name="destination_airport_id" label="Destination airport" />
          <label className="text-xs font-medium text-navy-600">
            Airline
            <select name="airline_id" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
              <option value="">— unspecified —</option>
              {airlines.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.iata_code ? `(${a.iata_code})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-navy-600">
            Flight number (only if a real, sourced number exists)
            <input name="flight_no" maxLength={8} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm uppercase" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Route class
            <select name="route_class" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
              <option value="direct">direct</option>
              <option value="connecting">connecting</option>
            </select>
          </label>
          <label className="text-xs font-medium text-navy-600">
            Operating days (only from a sourced schedule)
            <input name="operating_days" maxLength={120} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Valid from
            <input name="valid_from" type="date" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Valid to
            <input name="valid_to" type="date" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600 md:col-span-2">
            Evidence source URL (required)
            <input name="evidence_source" type="url" required className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600 md:col-span-2">
            Evidence note
            <input name="evidence_note" maxLength={500} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <div className="md:col-span-2">
            <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white">
              Save route (starts unverified)
            </button>
          </div>
        </form>
      </details>

      <div className="mt-6 overflow-x-auto rounded-lg border border-navy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-navy-50 text-left text-navy-600">
              <th className="px-4 py-2.5">Route</th>
              <th className="px-4 py-2.5">Airline</th>
              <th className="px-4 py-2.5">Class</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Evidence</th>
              <th className="px-4 py-2.5">Set status</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.id} className="border-b border-navy-100 last:border-0">
                <td className="px-4 py-3 font-mono text-xs">
                  {r.origin?.iata_code ?? "???"} → {r.destination?.iata_code ?? "???"}
                  <span className="block text-navy-400">{r.flight_no ?? ""}</span>
                </td>
                <td className="px-4 py-3 text-xs">{r.airline?.name ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{r.route_class}</td>
                <td className={`px-4 py-3 text-xs font-semibold ${STATUS_STYLES[r.operating_status] ?? ""}`}>
                  {r.operating_status}
                </td>
                <td className="px-4 py-3 text-xs">
                  <a href={r.evidence_source} target="_blank" rel="noopener noreferrer" className="underline">
                    source
                  </a>
                  {r.verified_at ? <span className="block text-navy-400">checked {String(r.verified_at).slice(0, 10)}</span> : null}
                </td>
                <td className="px-4 py-3">
                  <form action={verifyRoute} className="flex flex-wrap gap-1">
                    <input type="hidden" name="route_id" value={r.id} />
                    <button name="status" value="current" className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white">Current</button>
                    <button name="status" value="seasonal" className="rounded bg-sky-700 px-2 py-1 text-xs font-semibold text-white">Seasonal</button>
                    <button name="status" value="suspended" className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-700">Suspended</button>
                    <button name="status" value="discontinued" className="rounded border border-red-300 px-2 py-1 text-xs text-red-700">Discontinued</button>
                    <button name="status" value="unverified" className="rounded border border-navy-200 px-2 py-1 text-xs text-navy-600">Reset</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {configured && routes.length === 0 ? (
          <p className="p-6 text-center text-sm text-navy-500">No routes recorded yet.</p>
        ) : null}
      </div>
    </div>
  );
}
