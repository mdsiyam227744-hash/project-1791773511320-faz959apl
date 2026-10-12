import Link from "next/link";
import { getBrand } from "@/lib/settings";
import { t, type Locale } from "@/lib/i18n";
import { getSessionUser } from "@/lib/auth";
import { getFlightServiceFee } from "@/lib/airports";
import { configStatus } from "@/lib/payments";
import { listCountries } from "@/lib/catalog";
import { FlightRequestForm } from "./flight-form";

export const metadata = {
  title: "Flight booking assistance — VisaBridge Global",
  description:
    "Request real flight booking assistance. We confirm live availability and exact fares with airlines before any booking — we never display invented prices.",
};

export default async function FlightsPage() {
  const brand = await getBrand();
  const locale: Locale = brand.defaultLocale;
  const user = await getSessionUser().catch(() => null);
  const [fee, countries] = await Promise.all([getFlightServiceFee(), listCountries().catch(() => [])]);
  // Live fare search would be a separate provider (Amadeus); it is not
  // configured, so the form shows the honest unavailable notice.
  const liveFareSearchConfigured = false;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">{t(locale, "flights.title")}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-navy-600">{t(locale, "flights.intro")}</p>

      {user ? (
        <div className="mt-8 rounded-xl border border-navy-100 bg-white p-4 md:p-6">
          <FlightRequestForm
            locale={locale}
            fee={
              fee
                ? { amount: fee.unitAmount, currency: fee.currency, labelEn: fee.labelEn, labelBn: fee.labelBn }
                : null
            }
            providerConfigured={liveFareSearchConfigured}
            countries={countries.map((c) => ({ iso2: c.iso2, name: c.name_en }))}
          />
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-navy-100 bg-white p-6">
          <p className="text-sm text-navy-700">{t(locale, "flights.loginRequired")}</p>
          <div className="mt-4 flex gap-3">
            <Link
              href="/login?next=/flights"
              className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              {t(locale, "nav.login")}
            </Link>
            <Link
              href="/register?next=/flights"
              className="rounded-md border border-navy-200 px-4 py-2.5 text-sm font-medium text-navy-700 hover:bg-navy-50"
            >
              {t(locale, "nav.register")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
