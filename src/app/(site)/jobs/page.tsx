import type { Metadata } from "next";
import { getBrand } from "@/lib/settings";
import { t } from "@/lib/i18n";
import { listPublicJobs } from "@/lib/catalog";

export const metadata: Metadata = { title: "Overseas Employment Listings" };

export default async function JobsPage() {
  const brand = await getBrand();
  const locale = brand.defaultLocale;
  const jobs = await listPublicJobs();

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-bold">{t(locale, "jobs.title")}</h1>
      <p className="mt-2 max-w-2xl text-sm text-navy-600">{t(locale, "jobs.verifyNote")}</p>

      {jobs.length === 0 ? (
        <p className="mt-8 rounded-lg border border-navy-100 bg-navy-50 p-6 text-navy-700">
          {t(locale, "jobs.none")}
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-lg border border-navy-100 bg-white p-5">
              <h2 className="font-semibold">
                <a href={`/jobs/${j.slug}`} className="hover:underline">
                  {j.title_en}
                </a>
              </h2>
              <p className="mt-1 text-sm text-navy-600">
                {j.employer.name}
                {j.employer.workplace ? ` — ${j.employer.workplace}` : ""}
                {j.employer.country ? `, ${j.employer.country.name_en}` : ""}
              </p>
              <dl className="mt-3 space-y-1 text-sm">
                {j.salary_amount !== null ? (
                  <div className="flex justify-between">
                    <dt className="text-navy-500">{t(locale, "jobs.salary")}</dt>
                    <dd>
                      {j.salary_amount} {j.salary_currency} / {j.salary_period ?? "month"}
                    </dd>
                  </div>
                ) : null}
                {j.application_deadline ? (
                  <div className="flex justify-between">
                    <dt className="text-navy-500">{t(locale, "jobs.deadline")}</dt>
                    <dd>{j.application_deadline}</dd>
                  </div>
                ) : null}
                {j.positions ? (
                  <div className="flex justify-between">
                    <dt className="text-navy-500">Positions</dt>
                    <dd>{j.positions}</dd>
                  </div>
                ) : null}
              </dl>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 rounded-lg bg-navy-50 p-4 text-xs text-navy-600">
        We never present a tourist visa as authorization to work. Employment requires the correct
        work permit and, where applicable, employer sponsorship.
      </p>
    </div>
  );
}
