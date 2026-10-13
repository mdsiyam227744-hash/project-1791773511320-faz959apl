import { requireStaff } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { listCorridors } from "@/lib/aviation";
import { listCountries } from "@/lib/catalog";
import { setCorridor, setPreferredAirport } from "../aviation-actions";
import { AirportIdField } from "@/components/airport-id-field";

export const metadata = { title: "Corridors — Admin" };

export default async function AdminCorridorsPage() {
  await requireStaff(["super_admin", "application_manager", "content_manager"]);
  const configured = isSupabaseConfigured();
  const countries = await listCountries();
  const corridors = await listCorridors();

  const supabase = createClient();
  const { data: preferred } = configured
    ? await supabase
        .from("preferred_airports")
        .select("id, country_code, city_municipality, airport:airports(name, iata_code)")
        .order("country_code")
        .limit(100)
    : { data: [] };
  const preferredRows = (preferred ?? []) as unknown as {
    id: string;
    country_code: string;
    city_municipality: string | null;
    airport: { name: string; iata_code: string | null } | null;
  }[];

  return (
    <div>
      <h1 className="text-2xl font-bold">Service corridors & default airports</h1>
      <p className="mt-1 max-w-3xl text-sm text-navy-600">
        Enable a corridor only when your service actually covers it — enabling a corridor says nothing about
        whether any airline operates its routes. A preferred airport is the default a customer sees for a
        country; it never implies exclusivity.
      </p>

      {!configured ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Database not connected yet — corridor settings cannot be listed or saved until provisioning completes.
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-navy-100 bg-white p-4">
          <h2 className="text-sm font-bold">Set a corridor</h2>
          <form action={setCorridor} className="mt-3 space-y-3">
            <label className="block text-xs font-medium text-navy-600">
              Origin country
              <select name="origin_country_id" required className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
                <option value="">— choose —</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name_en}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-navy-600">
              Destination country
              <select name="destination_country_id" required className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
                <option value="">— choose —</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name_en}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-navy-600">
              State
              <select name="enabled" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
                <option value="true">enabled</option>
                <option value="false">disabled</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-navy-600">
              Internal note
              <input name="note" maxLength={300} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
            </label>
            <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white">
              Save corridor
            </button>
          </form>

          <h3 className="mt-6 text-xs font-bold uppercase tracking-wide text-navy-500">Current corridors</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {corridors.slice(0, 30).map((c) => (
              <li key={c.id} className="flex items-center justify-between border-b border-navy-50 pb-1">
                <span>
                  {c.origin?.name_en ?? "—"} → {c.destination?.name_en ?? "—"}
                </span>
                <span className={c.enabled ? "text-emerald-700" : "text-navy-400"}>
                  {c.enabled ? "enabled" : "disabled"}
                </span>
              </li>
            ))}
            {configured && corridors.length === 0 ? (
              <li className="text-xs text-navy-400">None configured yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-lg border border-navy-100 bg-white p-4">
          <h2 className="text-sm font-bold">Preferred (default) airport</h2>
          <form action={setPreferredAirport} className="mt-3 space-y-3">
            <label className="block text-xs font-medium text-navy-600">
              Country code (ISO 3166-1 alpha-2)
              <input
                name="country_code"
                required
                maxLength={2}
                pattern="[A-Za-z]{2}"
                className="mt-1 w-24 rounded border border-navy-200 px-2 py-1.5 text-sm uppercase"
              />
            </label>
            <label className="block text-xs font-medium text-navy-600">
              City (optional — narrows the default to one city)
              <input name="city" maxLength={120} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
            </label>
            <AirportIdField name="airport_id" label="Airport" />
            <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white">
              Save default airport
            </button>
          </form>

          <h3 className="mt-6 text-xs font-bold uppercase tracking-wide text-navy-500">Configured defaults</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {preferredRows.map((p) => (
              <li key={p.id} className="flex items-center justify-between border-b border-navy-50 pb-1">
                <span>
                  {p.country_code}
                  {p.city_municipality ? ` · ${p.city_municipality}` : ""}
                </span>
                <span className="text-navy-600">
                  {p.airport?.name ?? "—"} {p.airport?.iata_code ? `(${p.airport.iata_code})` : ""}
                </span>
              </li>
            ))}
            {configured && preferredRows.length === 0 ? (
              <li className="text-xs text-navy-400">None configured — country pages will not claim any default.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
