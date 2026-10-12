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
        <p className="mt-8 rounded-lg border border-navy-100 bg-navy-50 p-6 text-navy-700">
          {t(locale, "common.noResults")}
        </p>
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
