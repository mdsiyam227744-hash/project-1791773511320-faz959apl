import Link from "next/link";
import type { Metadata } from "next";
import { getBrand } from "@/lib/settings";
import { t } from "@/lib/i18n";
import { listCategories, listVisaListings } from "@/lib/catalog";

export const metadata: Metadata = { title: "Visa Categories" };

/** Short, honest paragraph per category code shown when no listings exist yet. */
const CATEGORY_HELP: Record<string, string> = {
  tourist:
    "Our team regularly assists with tourist and visitor applications. Contact us with your destination and travel dates and we will confirm the current requirements from the official source.",
  work:
    "Overseas employment applications are prepared individually — every employer and work permit has its own process. Send us the job offer or country you are targeting and we will map the exact steps.",
  student:
    "Study applications depend on your institution and course. Tell us where you have an offer (or which countries you are considering) and we will build the document checklist with you.",
  business:
    "Business visits vary by purpose — meetings, conferences, or investment. Contact us with your travel purpose and we will confirm which category applies and what the embassy requires.",
  family:
    "Family and dependent applications are tied to the sponsor's status. Contact us with the sponsor's situation and we will explain who can apply and what evidence is needed.",
  transit:
    "Transit rules depend on your nationality, the transit airport, and whether you leave the terminal. Contact us with your itinerary and we will check the official transit policy.",
  medical:
    "Medical travel needs treatment confirmations from the receiving hospital. Contact us and we will coordinate the document set the embassy expects.",
  residence:
    "Residence and immigration pathways are long-term processes assessed case by case. Contact us for a consultation on eligibility and documentation.",
  other:
    "This category covers country-specific programs. Contact us and we will confirm what is currently available.",
};

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
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold">{t(locale, "visas.title")}</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-navy-600">
        Choose the purpose of your travel. Every listing shows its official source and
        verification date — requirements are always confirmed against the authority's own
        pages before you rely on them.
      </p>
      {country ? (
        <p className="mt-3 text-base text-navy-600">
          Showing listings for destination country <strong>{country}</strong>.{" "}
          <Link href="/visa-categories" className="font-medium underline">
            Clear filter
          </Link>
        </p>
      ) : null}

      <div className="mt-10 space-y-12">
        {categories.map((cat) => {
          const catListings = listings.filter((l) => l.category_code === cat.code);
          return (
            <section key={cat.code} id={cat.code} className="scroll-mt-24">
              <h2 className="text-2xl font-bold">
                {locale === "bn" && cat.label_bn ? cat.label_bn : cat.label_en}
              </h2>
              <p className="mt-2 text-base leading-relaxed text-navy-600">{cat.description_en}</p>

              {catListings.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-navy-200 bg-navy-50/60 p-5">
                  <p className="text-base leading-relaxed text-navy-700">
                    {CATEGORY_HELP[cat.code] ??
                      "Contact our team for the latest requirements in this category."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link
                      href={`/apply/guided?kind=${cat.code === "residence" ? "other" : cat.code}`}
                      className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                    >
                      Start a {locale === "bn" && cat.label_bn ? cat.label_bn : cat.label_en}{" "}
                      application
                    </Link>
                    <Link
                      href="/contact"
                      className="rounded-md border border-navy-200 px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
                    >
                      {t(locale, "cta.contact")}
                    </Link>
                  </div>
                </div>
              ) : (
                <ul className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {catListings.map((v) => (
                    <li
                      key={v.id}
                      className="flex flex-col rounded-xl border border-navy-100 bg-white p-5 shadow-sm transition hover:border-[var(--brand-secondary)]"
                    >
                      <p className="text-sm font-medium uppercase tracking-wide text-navy-500">
                        {v.origin ? `${v.origin.name_en} → ` : ""}
                        {v.destination.name_en}
                      </p>
                      <Link
                        href={`/visa/${v.slug}`}
                        className="mt-1 text-lg font-semibold leading-snug hover:underline"
                      >
                        {v.official_name_en}
                      </Link>
                      <p className="mt-2 text-sm text-navy-600">
                        {t(locale, "common.processingTime")}: {v.processing_time_estimate ?? "—"}
                      </p>
                      <p className="mt-1 text-sm text-navy-600">
                        {t(locale, "common.lastVerified")}:{" "}
                        {v.last_verified ?? t(locale, "common.notVerified")}
                      </p>
                      <div className="mt-4 flex gap-2 pt-1">
                        <Link
                          href={`/visa/${v.slug}`}
                          className="rounded-md border border-navy-200 px-3 py-2 text-sm font-semibold text-navy-700 hover:bg-navy-50"
                        >
                          {t(locale, "common.viewDetails")}
                        </Link>
                        <Link
                          href={`/apply/guided?visa=${v.slug}`}
                          className="rounded-md bg-[var(--brand-primary)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                        >
                          {t(locale, "cta.apply")}
                        </Link>
                      </div>
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
