import Link from "next/link";
import type { Metadata } from "next";
import { getBrand } from "@/lib/settings";
import { t } from "@/lib/i18n";
import { listCountries } from "@/lib/catalog";

export const metadata: Metadata = { title: "Countries & Destinations" };

export default async function CountriesPage() {
  const brand = await getBrand();
  const locale = brand.defaultLocale;
  const countries = await listCountries();
  const byRegion = new Map<string, typeof countries>();
  for (const c of countries) {
    const region = c.region ?? "Other";
    if (!byRegion.has(region)) byRegion.set(region, []);
    byRegion.get(region)!.push(c);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-bold">{t(locale, "countries.title")}</h1>
      <p className="mt-2 max-w-2xl text-navy-600">
        Origin and destination countries in our directory. Open a country to see available visa
        categories, requirements, and verified fee records.
      </p>

      {countries.length === 0 ? (
        <div className="mt-8 rounded-lg border border-navy-100 bg-navy-50 p-6">
          <p className="text-base leading-relaxed text-navy-700">
            The country directory is being prepared right now. Our team already assists with the
            major destinations — for Bangladeshi and South Asian passport holders these include
            Thailand, Malaysia, Singapore, the United Arab Emirates, Saudi Arabia, Qatar, the
            United Kingdom, the United States, Canada, Australia, and Japan, among others.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/contact"
              className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Ask about your destination
            </Link>
            <Link
              href="/visa-categories"
              className="rounded-md border border-navy-200 px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
            >
              {t(locale, "nav.visas")}
            </Link>
          </div>
        </div>
      ) : (
        [...byRegion.entries()].sort().map(([region, list]) => (
          <section key={region} className="mt-8">
            <h2 className="text-lg font-semibold text-navy-800">{region}</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/visa-categories?country=${c.iso2}`}
                    className="flex items-center justify-between rounded-lg border border-navy-100 px-4 py-3 text-sm hover:border-[var(--brand-secondary)]"
                  >
                    <span>{locale === "bn" && c.name_bn ? c.name_bn : c.name_en}</span>
                    <span className="text-xs uppercase tracking-wider text-navy-400">{c.iso2}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
