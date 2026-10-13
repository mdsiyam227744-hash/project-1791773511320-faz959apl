import Link from "next/link";
import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getAirportById } from "@/lib/aviation";
import { listPublicRoutes } from "@/lib/aviation-records";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

export const metadata = {
  title: "Airport details — VisaBridge Global",
};

export default async function AirportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const locale = DEFAULT_LOCALE;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!isSupabaseConfigured()) notFound();

  const airport = await getAirportById(id);
  if (!airport || !airport.active) notFound();

  // Only separately verified operating routes are shown — the airport's mere
  // existence is never presented as evidence of service.
  const routes = airport.iata_code ? await listPublicRoutes({ originAirportId: airport.id, limit: 20 }) : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <nav className="text-sm" aria-label="Breadcrumb">
        <Link href="/airports" className="text-[var(--brand-primary)] underline">← {t(locale, "airports.title")}</Link>
      </nav>

      <header className="mt-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-bold text-navy-900">{airport.name}</h1>
          <span className="font-mono text-lg text-navy-600">
            {airport.iata_code ?? "—"} {airport.icao_code ? `/ ${airport.icao_code}` : ""}
          </span>
        </div>
        <p className="mt-1 text-navy-600">
          {airport.city_municipality ?? ""} {airport.iso_country}
          {airport.iso_region ? ` · ${airport.iso_region}` : ""}
        </p>
        <p className="mt-2 inline-block rounded bg-navy-50 px-2 py-1 text-xs text-navy-600">
          {airport.airport_type.replace(/_/g, " ")}
          {airport.scheduled_service ? ` · ${t(locale, "airports.scheduled")}` : ""}
          {" · "}
          {airport.verification_status === "verified" ? t(locale, "airports.verified") : t(locale, "airports.unverified")}
        </p>
      </header>

      <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {t(locale, "airports.notBookable")}
      </p>

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-navy-500">{t(locale, "airports.coordinates")}</dt>
          <dd className="text-navy-900">
            {airport.latitude != null && airport.longitude != null
              ? `${Number(airport.latitude).toFixed(4)}, ${Number(airport.longitude).toFixed(4)}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-navy-500">{t(locale, "airports.dataSource")}</dt>
          <dd className="text-navy-900">
            {airport.data_source}
            {airport.dataset_version ? ` (${airport.dataset_version})` : ""}
            {airport.source_ident ? ` · id ${airport.source_ident}` : ""}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-navy-500">{t(locale, "airports.lastVerified")}</dt>
          <dd className="text-navy-900">
            {airport.verified_at ? String(airport.verified_at).slice(0, 10) : t(locale, "common.notVerified")}
          </dd>
        </div>
        {airport.home_link ? (
          <div>
            <dt className="font-medium text-navy-500">Website</dt>
            <dd>
              <a href={airport.home_link} target="_blank" rel="noopener noreferrer" className="text-[var(--brand-primary)] underline">
                {airport.home_link}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>

      <section className="mt-10">
        <h2 className="text-xl font-bold text-navy-900">{t(locale, "airports.routes.title")}</h2>
        {routes.length === 0 ? (
          <p className="mt-2 text-sm text-navy-500">{t(locale, "airports.routes.none")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-navy-100 rounded-lg border border-navy-100 bg-white">
            {routes.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  <span className="font-mono font-semibold">{r.origin?.iata_code ?? "???"}</span>
                  {" → "}
                  <span className="font-mono font-semibold">{r.destination?.iata_code ?? "???"}</span>
                  <span className="ml-2 text-navy-500">{r.airline?.name ?? ""}</span>
                </span>
                <span className="text-xs text-sky-700">{r.operating_status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 rounded-lg border border-navy-100 bg-navy-50 p-4">
        <h2 className="text-base font-bold text-navy-900">{t(locale, "airports.distance.title")}</h2>
        <p className="mt-1 text-sm text-navy-600">{t(locale, "airports.distance.intro")}</p>
        <Link
          href={`/flights/distance?from=${airport.id}`}
          className="mt-3 inline-block rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white"
        >
          {t(locale, "airports.distance.calculate")}
        </Link>
      </section>
    </div>
  );
}
