import Link from "next/link";
import type { Metadata } from "next";
import { getBrand } from "@/lib/settings";
import { t } from "@/lib/i18n";
import { listCategories, listCountries, listVisaListings } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Visa, Immigration & Travel Assistance",
  description:
    "Verified visa information, honest cost estimates, and guided application assistance for travel, study, work, and business worldwide.",
};

export default async function HomePage() {
  const [brand, countries, categories, recentVisas] = await Promise.all([
    getBrand(),
    listCountries({ destination: true }),
    listCategories(),
    listVisaListings({ limit: 6 }),
  ]);
  const locale = brand.defaultLocale;

  return (
    <>
      {/* Hero */}
      <section className="bg-[var(--brand-primary)] text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--brand-secondary)]">
            {brand.businessName} — {brand.tagline[locale]}
          </p>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight md:text-5xl">
            {t(locale, "hero.title")}
          </h1>
          <p className="mt-4 max-w-2xl text-base text-navy-100 md:text-lg">
            {t(locale, "hero.subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/visa-categories"
              className="rounded-md bg-[var(--brand-secondary)] px-5 py-3 text-sm font-semibold text-navy-950 hover:opacity-90"
            >
              {t(locale, "cta.explore")}
            </Link>
            <Link
              href="/countries"
              className="rounded-md border border-navy-300 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              {t(locale, "cta.findDestination")}
            </Link>
            <Link
              href="/apply/guided"
              className="rounded-md border border-navy-300 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              {t(locale, "cta.apply")}
            </Link>
          </div>
        </div>
      </section>

      {/* Why global mobility */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold">{t(locale, "home.why.title")}</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-navy-700">{t(locale, "home.why.body")}</p>
      </section>

      {/* Directory */}
      <section className="bg-navy-50 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold">{t(locale, "home.directory.title")}</h2>
          <p className="mt-2 max-w-3xl text-navy-700">{t(locale, "home.directory.body")}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <Link
                key={c.code}
                href={`/visa-categories#${c.code}`}
                className="rounded-lg border border-navy-100 bg-white p-5 transition hover:border-[var(--brand-secondary)]"
              >
                <h3 className="font-semibold">{locale === "bn" && c.label_bn ? c.label_bn : c.label_en}</h3>
                <p className="mt-1 text-sm text-navy-600">{c.description_en}</p>
              </Link>
            ))}
          </div>

          {recentVisas.length > 0 ? (
            <div className="mt-10">
              <h3 className="text-lg font-semibold">{t(locale, "common.viewAll")} — recent listings</h3>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recentVisas.map((v) => (
                  <li key={v.id} className="rounded-lg border border-navy-100 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-navy-500">
                      {v.origin?.name_en} → {v.destination.name_en}
                    </p>
                    <Link href={`/visa/${v.slug}`} className="font-medium hover:underline">
                      {v.official_name_en}
                    </Link>
                    <p className="mt-1 text-xs text-navy-500">
                      {t(locale, "common.lastVerified")}: {v.last_verified ?? t(locale, "common.notVerified")}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="mt-8 text-sm text-navy-600">
            {countries.length} destination countries in the directory — new countries are added by
            our team continuously.
          </p>
        </div>
      </section>

      {/* Process teaser */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold">{t(locale, "home.process.title")}</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-4">
          {[
            "Create your account and tell us your plan",
            "We confirm requirements, fees, and timeline",
            "You upload documents securely; we review",
            "Application submitted to the authority; you track every step",
          ].map((step, i) => (
            <li key={i} className="rounded-lg border border-navy-100 p-4">
              <span className="mb-2 inline-grid h-8 w-8 place-items-center rounded-full bg-[var(--brand-primary)] text-sm font-bold text-[var(--brand-secondary)]">
                {i + 1}
              </span>
              <p className="text-sm text-navy-700">{step}</p>
            </li>
          ))}
        </ol>
        <Link href="/process" className="mt-6 inline-block text-sm font-medium text-navy-700 underline">
          {t(locale, "common.viewAll")} — {t(locale, "process.title")}
        </Link>
      </section>

      {/* Trust, pricing approach, and support — factual only, nothing invented */}
      <section className="bg-navy-50 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-bold">Our commitments to you</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Verified information only",
                body: "Requirements, processing times, and official fees on this site carry their source and verification date. Anything we could not verify is labelled as such — we never present a guess as a fact.",
              },
              {
                title: "Honest pricing",
                body: "Our service fees are shown separately from government fees, before you pay anything. When a price is not yet confirmed, we say so instead of inventing an amount.",
              },
              {
                title: "Real people, reachable",
                body: "Every order gets a reference number and a named team member. Reach us through the contact buttons on this page or the contact form — we answer in English and Bangla.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-navy-100 bg-white p-5">
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-700">{item.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm leading-relaxed text-navy-600">
            VisaBridge Global is a private assistance service. We are not a government authority and
            we do not issue visas or airline tickets ourselves — decisions always rest with the
            embassies, consulates, and airlines. We charge only for our preparation, guidance, and
            liaison work, and every paid service is covered by the refund policy published on this
            site.
          </p>
        </div>
      </section>
    </>
  );
}
