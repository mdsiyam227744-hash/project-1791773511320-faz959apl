import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { updateAirport, setAirportActive } from "./actions";

export const metadata = { title: "Airports — Admin" };

export default async function AdminAirports({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireStaff(["super_admin", "application_manager"]);
  const { q, page } = await searchParams;
  const supabase = createClient();
  const pageNum = Math.max(1, Number(page ?? "1") || 1);
  const perPage = 25;

  let query = supabase
    .from("airports")
    .select("id, ident, iata_code, icao_code, name, city_municipality, iso_country, airport_type, active", {
      count: "exact",
    })
    .order("name")
    .range((pageNum - 1) * perPage, pageNum * perPage - 1);
  if (q && q.trim().length >= 2) {
    const like = `%${q.trim()}%`;
    query = query.or(`name.ilike.${like},iata_code.ilike.${q.trim()}%,city_municipality.ilike.${like},ident.ilike.${like}`);
  }
  const { data, count } = await query;
  const rows = (data ?? []) as unknown as {
    id: string;
    ident: string;
    iata_code: string | null;
    icao_code: string | null;
    name: string;
    city_municipality: string | null;
    iso_country: string;
    airport_type: string;
    active: boolean;
  }[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / perPage));

  return (
    <div>
      <h1 className="text-2xl font-bold">Airport directory</h1>
      <p className="mt-1 max-w-3xl text-sm text-navy-600">
        {count ?? 0} airports from the maintained public-domain OurAirports dataset. You can correct names
        or deactivate a record so it no longer appears in search — rows are never deleted, so past orders
        keep their references. The dataset can be refreshed by regenerating the seed file; your
        corrections to a row are overwritten only when the upstream data for that row changes.
      </p>

      <form method="get" className="mt-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Name, IATA code, city…"
          className="rounded-md border border-navy-200 px-3 py-2 text-sm"
        />
        <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white">
          Search
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-navy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-navy-50 text-left text-navy-600">
              <th className="px-4 py-2.5">IATA</th>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">City</th>
              <th className="px-4 py-2.5">CC</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Correct</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-navy-100 last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{a.iata_code ?? "—"}</td>
                <td className="px-4 py-3">{a.name}</td>
                <td className="px-4 py-3">{a.city_municipality ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{a.iso_country}</td>
                <td className="px-4 py-3 text-xs text-navy-500">{a.airport_type}</td>
                <td className="px-4 py-3 text-xs">
                  <form action={setAirportActive} className="flex items-center gap-1">
                    <input type="hidden" name="airport_id" value={a.id} />
                    <input type="hidden" name="active" value={a.active ? "false" : "true"} />
                    <span className={a.active ? "text-emerald-700" : "text-navy-400"}>
                      {a.active ? "active" : "inactive"}
                    </span>
                    <button className="underline">{a.active ? "deactivate" : "activate"}</button>
                  </form>
                </td>
                <td className="px-4 py-3">
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-navy-700">Edit</summary>
                    <form action={updateAirport} className="mt-2 w-56 space-y-2">
                      <input type="hidden" name="airport_id" value={a.id} />
                      <input
                        name="name"
                        defaultValue={a.name}
                        className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs"
                        aria-label="Airport name"
                      />
                      <input
                        name="city"
                        defaultValue={a.city_municipality ?? ""}
                        className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs"
                        aria-label="City"
                      />
                      <input
                        name="iata"
                        defaultValue={a.iata_code ?? ""}
                        maxLength={3}
                        className="w-full rounded border border-navy-200 px-2 py-1.5 text-xs uppercase"
                        aria-label="IATA code"
                      />
                      <button className="w-full rounded bg-[var(--brand-primary)] px-2 py-1.5 text-xs font-semibold text-white">
                        Save
                      </button>
                    </form>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-navy-500">No airports match the search.</p>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <nav className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="Pagination">
          {Array.from({ length: Math.min(totalPages, 20) }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/airports?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded border px-3 py-1.5 ${
                p === pageNum ? "border-[var(--brand-primary)] font-semibold" : "border-navy-200"
              }`}
            >
              {p}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
