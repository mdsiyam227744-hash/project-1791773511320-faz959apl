import Link from "next/link";
import type { Metadata } from "next";
import { getBrand } from "@/lib/settings";
import { t } from "@/lib/i18n";
import { listCategories, listVisaListings } from "@/lib/catalog";

export const metadata: Metadata = { title: "Visa Categories" };

export default async function VisaCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const { country } = await searchParams;
  const brand = await getBrand();
  const locale = brand.defaultLocale;
  const categories = await listCategories();
  const listings = await listVisaListings({ destinationIso2: country, limit: 100 });

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-bold">{t(locale, "visas.title")}</h1>
      {country ? (
        <p className="mt-2 text-navy-600">
          Showing listings for destination country <strong>{country}</strong>.{" "}
          <Link href="/visa-categories" className="underline">Clear filter</Link>
        </p>
      ) : null}

      <div className="mt-8 space-y-10">
        {categories.map((cat) => {
          const catListings = listings.filter((l) => l.category_code === cat.code);
          return (
            <section key={cat.code} id={cat.code} className="scroll-mt-24">
              <h2 className="text-xl font-semibold">{locale === "bn" && cat.label_bn ? cat.label_bn : cat.label_en}</h2>
              <p className="mt-1 text-sm text-navy-600">{cat.description_en}</p>
              {catListings.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-navy-200 p-4 text-sm text-navy-500">
                  No published listings for this category yet — contact our team for the latest
                  requirements.
                </p>
              ) : (
                <ul className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {catListings.map((v) => (
                    <li key={v.id} className="rounded-lg border border-navy-100 bg-white p-4">
                      <p className="text-xs uppercase tracking-wide text-navy-500">
                        {v.origin ? `${v.origin.name_en} → ` : ""}
                        {v.destination.name_en}
                      </p>
                      <Link href={`/visa/${v.slug}`} className="font-medium hover:underline">
                        {v.official_name_en}
                      </Link>
                      <p className="mt-2 text-xs text-navy-500">
                        {t(locale, "common.processingTime")}: {v.processing_time_estimate ?? "—"}
                      </p>
                      <p className="text-xs text-navy-500">
                        {t(locale, "common.lastVerified")}:{" "}
                        {v.last_verified ?? t(locale, "common.notVerified")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
