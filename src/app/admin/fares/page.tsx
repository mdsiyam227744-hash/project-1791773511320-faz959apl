import { requireStaff } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { listFareObservations } from "@/lib/aviation-records";
import { saveFareObservation, reviewFareObservation } from "../aviation-actions";
import { AirportIdField } from "@/components/airport-id-field";
import { fareDisplayState } from "@/lib/reference-data";

export const metadata = { title: "Fare observations — Admin" };

export default async function AdminFaresPage() {
  await requireStaff(["super_admin", "application_manager", "content_manager", "support_agent"]);
  const configured = isSupabaseConfigured();
  const observations = await listFareObservations({});
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <h1 className="text-2xl font-bold">Indicative fare observations</h1>
      <p className="mt-1 max-w-3xl text-sm text-navy-600">
        Manual fare research entries — always labelled to customers as indicative references, never as live or
        bookable fares. Every entry needs its source URL, observation date, and travel-date range; published
        entries expire automatically after their validity date or 90 days.
      </p>

      {!configured ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Database not connected yet — fare records cannot be listed or saved until provisioning completes.
        </p>
      ) : null}

      <details className="mt-4 rounded-lg border border-navy-100 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold">Record a fare observation</summary>
        <form action={saveFareObservation} className="mt-3 grid gap-3 md:grid-cols-2">
          <AirportIdField name="origin_airport_id" label="Origin airport" />
          <AirportIdField name="destination_airport_id" label="Destination airport" />
          <label className="text-xs font-medium text-navy-600">
            Trip type
            <select name="trip_type" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
              <option value="one_way">one way</option>
              <option value="return">return</option>
            </select>
          </label>
          <label className="text-xs font-medium text-navy-600">
            Cabin
            <select name="cabin_class" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
              <option value="economy">economy</option>
              <option value="premium_economy">premium economy</option>
              <option value="business">business</option>
              <option value="first">first</option>
            </select>
          </label>
          <label className="text-xs font-medium text-navy-600">
            Travel date from
            <input name="travel_date_from" type="date" required className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Travel date to (optional)
            <input name="travel_date_to" type="date" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Passengers assumed
            <input name="passengers" type="number" min={1} max={9} defaultValue={1} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Observed price
            <input name="observed_price" required inputMode="decimal" pattern="\d+(\.\d{1,2})?" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Currency
            <input name="currency" required maxLength={3} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm uppercase" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Taxes included?
            <select name="taxes_included" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
              <option value="false">no — taxes extra</option>
              <option value="true">yes — total price</option>
            </select>
          </label>
          <label className="text-xs font-medium text-navy-600">
            Journey
            <select name="journey_type" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
              <option value="direct">direct</option>
              <option value="connecting">connecting</option>
              <option value="unspecified">unspecified</option>
            </select>
          </label>
          <label className="text-xs font-medium text-navy-600 md:col-span-2">
            Baggage assumption
            <input name="baggage_note" maxLength={200} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600 md:col-span-2">
            Source URL (required — where you observed this fare)
            <input name="source_url" type="url" required className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Observation date
            <input name="observation_date" type="date" required className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Valid until (optional; default staleness 90 days)
            <input name="valid_until" type="date" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <div className="md:col-span-2">
            <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white">
              Save as draft
            </button>
          </div>
        </form>
      </details>

      <h2 className="mt-8 text-lg font-bold">Review queue</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-navy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-navy-50 text-left text-navy-600">
              <th className="px-4 py-2.5">Pair</th>
              <th className="px-4 py-2.5">Fare</th>
              <th className="px-4 py-2.5">Trip</th>
              <th className="px-4 py-2.5">Observed</th>
              <th className="px-4 py-2.5">State</th>
              <th className="px-4 py-2.5">Source</th>
              <th className="px-4 py-2.5">Decision</th>
            </tr>
          </thead>
          <tbody>
            {observations.map((o) => {
              const display = fareDisplayState({
                status: o.verification_status,
                observationDate: o.observation_date,
                validUntil: o.valid_until,
                today,
              });
              return (
                <tr key={o.id} className="border-b border-navy-100 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">
                    {o.origin?.iata_code ?? "???"} → {o.destination?.iata_code ?? "???"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {o.observed_price} {o.currency}
                    <span className="block text-navy-400">{o.taxes_included ? "taxes incl." : "taxes extra"}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {o.trip_type} · {o.cabin_class} · {o.journey_type}
                  </td>
                  <td className="px-4 py-3 text-xs">{o.observation_date}</td>
                  <td className="px-4 py-3 text-xs font-semibold">
                    <span className={display === "indicative_current" ? "text-emerald-700" : display === "expired" ? "text-amber-700" : "text-navy-500"}>
                      {o.verification_status}
                    </span>
                    {display === "expired" && o.verification_status === "published" ? (
                      <span className="block text-amber-700">stale — hiding from customers</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <a href={o.source_url} target="_blank" rel="noopener noreferrer" className="underline">source</a>
                  </td>
                  <td className="px-4 py-3">
                    <form action={reviewFareObservation} className="flex flex-wrap gap-1">
                      <input type="hidden" name="observation_id" value={o.id} />
                      <button name="decision" value="published" className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white">Publish</button>
                      <button name="decision" value="pending_review" className="rounded border border-sky-300 px-2 py-1 text-xs text-sky-700">Review</button>
                      <button name="decision" value="rejected" className="rounded border border-red-300 px-2 py-1 text-xs text-red-700">Reject</button>
                      <button name="decision" value="withdrawn" className="rounded border border-navy-200 px-2 py-1 text-xs text-navy-600">Withdraw</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {configured && observations.length === 0 ? (
          <p className="p-6 text-center text-sm text-navy-500">No fare observations yet.</p>
        ) : null}
      </div>
    </div>
  );
}
