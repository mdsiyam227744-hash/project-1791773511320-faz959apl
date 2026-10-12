import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBrand } from "@/lib/settings";
import { t } from "@/lib/i18n";
import { getVisaListingBySlug } from "@/lib/catalog";
import { getVisaFees, FEE_KIND_LABELS, type FeeKind } from "@/lib/fees";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getVisaListingBySlug(slug);
  return { title: listing?.official_name_en ?? "Visa details" };
}

export default async function VisaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [brand, listing] = await Promise.all([getBrand(), getVisaListingBySlug(slug)]);
  if (!listing || listing.status !== "published") notFound();

  const locale = brand.defaultLocale;
  const fees = await getVisaFees(listing.id);

  const fields: { label: string; value: string | null }[] = [
    { label: t(locale, "common.processingTime"), value: listing.processing_time_estimate },
    { label: t(locale, "common.validity"), value: listing.validity },
    { label: t(locale, "common.permittedStay"), value: listing.permitted_stay },
    { label: t(locale, "common.workAuth"), value: listing.work_authorization },
    { label: t(locale, "common.source"), value: listing.processing_time_source },
  ];

  return (
    <article className="mx-auto max-w-4xl px-4 py-14">
      <nav className="text-sm text-navy-500">
        <Link href="/visa-categories" className="hover:underline">
          {t(locale, "visas.title")}
        </Link>
        {" / "}
        <span>{listing.official_name_en}</span>
      </nav>

      <h1 className="mt-3 text-3xl font-bold">{listing.official_name_en}</h1>
      <p className="mt-2 text-navy-600">
        {listing.origin ? `${listing.origin.name_en} → ` : ""}
        {listing.destination.name_en}
      </p>
      {listing.summary_en ? <p className="mt-4 leading-relaxed">{listing.summary_en}</p> : null}

      {/* Verification banner */}
      <div className="mt-6 rounded-lg border border-gold-300 bg-gold-50 p-4 text-sm">
        <p className="font-medium">
          {t(locale, "common.lastVerified")}:{" "}
          {listing.last_verified ?? t(locale, "common.notVerified")}
        </p>
        {listing.official_url ? (
          <a
            href={listing.official_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-1 inline-block underline"
          >
            {t(locale, "common.officialInfo")}: {listing.official_url}
          </a>
        ) : null}
      </div>

      {/* Fees */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Fees</h2>
        {fees.length === 0 ? (
          <p className="mt-2 text-sm text-navy-600">{t(locale, "common.contactForLatest")}</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-navy-500">
                <th className="py-2">Item</th>
                <th className="py-2">Type</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {fees.map((f) => (
                <tr key={f.id} className="border-b border-navy-100">
                  <td className="py-2">{f.label_en}</td>
                  <td className="py-2 text-navy-600">{FEE_KIND_LABELS[f.kind as FeeKind]}</td>
                  <td className="py-2">
                    {f.amount !== null ? `${f.amount} ${f.currency}` : "—"}
                  </td>
                  <td className="py-2">
                    {f.is_verified ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                        {t(locale, "common.verified")}
                      </span>
                    ) : (
                      <span className="rounded bg-gold-100 px-2 py-0.5 text-xs text-gold-800">
                        {t(locale, "common.notVerified")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-navy-500">
          Official government fees are set by the destination authority. Our service fees are
          separate and shown before you pay anything.
        </p>
      </section>

      {/* Details */}
      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold">Eligibility</h2>
          <p className="mt-2 text-sm leading-relaxed text-navy-700">{listing.eligibility_en ?? "—"}</p>
          <h2 className="mt-6 text-xl font-semibold">{t(locale, "documents.title")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-navy-700">
            {listing.required_documents_en ?? "—"}
          </p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">How to apply</h2>
          <p className="mt-2 text-sm leading-relaxed text-navy-700">
            {listing.application_steps_en ?? "—"}
          </p>
          <dl className="mt-6 space-y-2 text-sm">
            {fields
              .filter((f) => f.value)
              .map((f) => (
                <div key={f.label} className="flex justify-between gap-4 border-b border-navy-100 pb-2">
                  <dt className="text-navy-500">{f.label}</dt>
                  <dd className="text-right font-medium">{f.value}</dd>
                </div>
              ))}
          </dl>
        </div>
      </section>

      {listing.refund_conditions ? (
        <section className="mt-10 rounded-lg bg-navy-50 p-4 text-sm text-navy-700">
          <h2 className="font-semibold">Refund conditions</h2>
          <p className="mt-1">{listing.refund_conditions}</p>
        </section>
      ) : null}

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href={`/apply/guided?visa=${listing.slug}`}
          className="rounded-md bg-[var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          {t(locale, "cta.apply")}
        </Link>
        <Link
          href="/contact"
          className="rounded-md border border-navy-200 px-5 py-3 text-sm font-semibold text-navy-700 hover:bg-navy-50"
        >
          {t(locale, "cta.contact")}
        </Link>
      </div>

      <p className="mt-8 text-xs text-navy-500">{t(locale, "common.disclaimer")}</p>
    </article>
  );
}
