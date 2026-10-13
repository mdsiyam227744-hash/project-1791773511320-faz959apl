import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { listPublicAirports } from "@/lib/aviation";
import { listCountries } from "@/lib/catalog";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

export const metadata = {
  title: "Airport directory — VisaBridge Global",
  description:
    "Search scheduled passenger airports worldwide. Verified dataset records with source provenance — not a booking service.",
};

const TYPES = ["large_airport", "medium_airport", "small_airport"];

export default async function AirportsDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; country?: string; type?: string; page?: string }>;
}) {
  const locale = DEFAULT_LOCALE;
  const { q, country, type, page } = await searchParams;
  const configured = isSupabaseConfigured();
  const { rows, total } = await listPublicAirports({
    query: q,
    country,
    type,
    page: Number(page ?? "1") || 1,
  });
  const countries = configured ? await listCountries() : [];
  const pageNum = Math.max(1, Number(page ?? "1") || 1);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold text-navy-900">{t(locale, "airports.title")}</h1>
        <p className="mt-2 max-w-3xl text-base text-navy-600">{t(locale, "airports.intro")}</p>
      </header>

      {!configured ? (
        <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Account services are temporarily unavailable, so the airport dataset cannot be queried right now.
          Please try again later.
        </p>
      ) : null}

      <form method="get" className="mt-6 flex flex-wrap items-end gap-2" role="search">
        <div>
          <label htmlFor="q" className="block text-sm font-medium text-navy-700">
            {t(locale, "airports.search")}
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            className="mt-1 w-64 rounded-md border border-navy-200 px-3 py-2 text-base"
          />
        </div>
        <div>
          <label htmlFor="country" className="block text-sm font-medium text-navy-700">
            {t(locale, "airports.country")}
          </label>
          <select id="country" name="country" defaultValue={country ?? ""} className="mt-1 rounded-md border border-navy-200 px-3 py-2 text-base">
            <option value="">—</option>
            {countries.map((c) => (
              <option key={c.iso2} value={c.iso2}>{locale === "bn" && c.name_bn ? c.name_bn : c.name_en}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="type" className="block text-sm font-medium text-navy-700">
            {t(locale, "airports.type")}
          </label>
          <select id="type" name="type" defaultValue={type ?? ""} className="mt-1 rounded-md border border-navy-200 px-3 py-2 text-base">
            <option value="">{t(locale, "airports.anyType")}</option>
            <option value="large_airport">{t(locale, "airports.large")}</option>
            <option value="medium_airport">{t(locale, "airports.medium")}</option>
            <option value="small_airport">{t(locale, "airports.small")}</option>
          </select>
        </div>
        <button className="rounded-md bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-semibold text-white">
          {t(locale, "common.search")}
        </button>
      </form>

      {total != null ? (
        <p className="mt-4 text-sm text-navy-500">
          {total} {t(locale, "airports.pairCount")}
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((a) => (
          <Link
            key={a.id}
            href={`/airports/${a.id}`}
            className="block rounded-lg border border-navy-100 bg-white p-4 transition hover:border-[var(--brand-primary)]"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-sm font-bold text-navy-900">{a.iata_code ?? "—"}</span>
              {a.verification_status === "verified" ? (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                  {t(locale, "airports.verified")}
                </span>
              ) : (
                <span className="rounded bg-navy-50 px-1.5 py-0.5 text-xs text-navy-500">
                  {t(locale, "airports.unverified")}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-semibold text-navy-900">{a.name}</p>
            <p className="text-xs text-navy-500">
              {a.city_municipality ?? ""} {a.iso_country}
            </p>
          </Link>
        ))}
      </div>

      {configured && rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-navy-100 bg-white p-6 text-center text-sm text-navy-500">
          {t(locale, "airports.noResults")}
        </p>
      ) : null}

      {total != null && total > 25 ? (
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Pagination">
          {Array.from({ length: Math.min(Math.ceil(total / 25), 40) }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/airports?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}${country ? `&country=${country}` : ""}${type ? `&type=${type}` : ""}`}
              className={`rounded border px-3 py-1.5 text-sm ${p === pageNum ? "border-[var(--brand-primary)] font-semibold" : "border-navy-200"}`}
            >
              {p}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
