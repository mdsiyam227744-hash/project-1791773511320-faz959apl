import { requireStaff } from "@/lib/auth";
import { listPublicAirports } from "@/lib/aviation";
import { listCountries } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { setAirportActive } from "./actions";
import { AirportVerifyForm, CsvImportPanel, MergeAndExportPanel, ImportHistory } from "./airport-forms";

export const metadata = {
  title: "Airport directory — Admin",
};

const TYPES = ["large_airport", "medium_airport", "small_airport"];

export default async function AdminAirportsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; country?: string; type?: string; page?: string }>;
}) {
  await requireStaff(["super_admin", "application_manager", "content_manager", "support_agent"]);
  const { q, country, type, page } = await searchParams;
  const { rows, total } = await listPublicAirports({
    query: q,
    country,
    type,
    page: Number(page ?? "1") || 1,
  });
  const countries = await listCountries();
  const pageNum = Math.max(1, Number(page ?? "1") || 1);
  const supabase = createClient();
  const { data: batchData } = await supabase
    .from("airport_import_batches")
    .select("id, file_name, rows_total, rows_rejected, rows_updated, conflict_policy, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  const batches = (batchData ?? []) as {
    id: string; file_name: string; rows_total: number; rows_rejected: number;
    rows_updated: number; conflict_policy: string; created_at: string;
  }[];

  return (
    <div>
      <h1 className="text-2xl font-bold">Airport directory</h1>
      <p className="mt-1 max-w-3xl text-sm text-navy-600">
        {total ?? 0} scheduled passenger airports from the maintained public-domain OurAirports dataset. Records
        keep their source identifier and verification state; imports never overwrite your verifications.
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="q" className="block text-xs font-medium text-navy-600">Search</label>
          <input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Name, IATA, ICAO, city, ident…"
            className="mt-1 w-64 rounded-md border border-navy-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="f-country" className="block text-xs font-medium text-navy-600">Country</label>
          <select id="f-country" name="country" defaultValue={country ?? ""} className="mt-1 rounded-md border border-navy-200 px-3 py-2 text-sm">
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c.iso2} value={c.iso2}>{c.name_en}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-type" className="block text-xs font-medium text-navy-600">Type</label>
          <select id="f-type" name="type" defaultValue={type ?? ""} className="mt-1 rounded-md border border-navy-200 px-3 py-2 text-sm">
            <option value="">Any type</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t.replace("_", " ")}</option>
            ))}
          </select>
        </div>
        <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white">
          Filter
        </button>
        <Link href="/admin/airports" className="px-2 py-2 text-sm text-navy-500 underline">Reset</Link>
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
              <th className="px-4 py-2.5">Verification</th>
              <th className="px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-navy-100 last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{a.iata_code ?? "—"}</td>
                <td className="px-4 py-3">
                  {a.name}
                  <span className="block text-xs text-navy-400">{a.ident} · source id {a.source_ident ?? "—"}</span>
                  {a.duplicate_of ? <span className="block text-xs text-amber-700">merged record</span> : null}
                </td>
                <td className="px-4 py-3">{a.city_municipality ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{a.iso_country}</td>
                <td className="px-4 py-3 text-xs text-navy-500">{a.airport_type}</td>
                <td className="px-4 py-3 text-xs">
                  {a.verification_status === "verified" ? (
                    <span className="text-emerald-700">verified{a.verified_at ? ` · ${String(a.verified_at).slice(0, 10)}` : ""}</span>
                  ) : a.verification_status === "rejected" ? (
                    <span className="text-red-700">rejected</span>
                  ) : (
                    <span className="text-navy-400">unverified</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-navy-700">Edit / verify</summary>
                    <div className="mt-2 w-64 space-y-2">
                      <AirportVerifyForm airport={a} />
                      <form action={setAirportActive} className="flex items-center gap-2 text-xs">
                        <input type="hidden" name="airport_id" value={a.id} />
                        <input type="hidden" name="active" value={a.active ? "false" : "true"} />
                        <span className={a.active ? "text-emerald-700" : "text-navy-400"}>{a.active ? "active" : "inactive"}</span>
                        <button className="underline">{a.active ? "deactivate" : "activate"}</button>
                      </form>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-navy-500">No airports match these filters.</p>
        ) : null}
      </div>

      {total && total > 25 ? (
        <nav className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="Pagination">
          {Array.from({ length: Math.min(Math.ceil(total / 25), 40) }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/airports?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}${country ? `&country=${country}` : ""}${type ? `&type=${type}` : ""}`}
              className={`rounded border px-3 py-1.5 ${p === pageNum ? "border-[var(--brand-primary)] font-semibold" : "border-navy-200"}`}
            >
              {p}
            </Link>
          ))}
        </nav>
      ) : null}

      <section className="mt-10 border-t border-navy-100 pt-6">
        <h2 className="text-lg font-bold">Import, merge & export</h2>
        <div className="mt-3 grid gap-6 md:grid-cols-2">
          <CsvImportPanel />
          <MergeAndExportPanel />
        </div>
        <ImportHistory batches={batches} />
      </section>
    </div>
  );
}
