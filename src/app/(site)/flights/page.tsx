import Link from "next/link";
import { getBrand } from "@/lib/settings";
import { t, type Locale } from "@/lib/i18n";
import { getSessionUser } from "@/lib/auth";
import { getFlightServiceFee } from "@/lib/airports";
import { configStatus } from "@/lib/flights";
import { listCountries } from "@/lib/catalog";
import { FlightSearchPanel } from "./flight-search-panel";

export const metadata = {
  title: "Flight search & booking assistance — VisaBridge Global",
  description:
    "Search live flight fares from our connected provider, or request real booking assistance. We never display invented prices, schedules, or availability.",
};

export default async function FlightsPage() {
  const brand = await getBrand();
  const locale: Locale = brand.defaultLocale;
  const user = await getSessionUser().catch(() => null);
  const [fee, countries] = await Promise.all([getFlightServiceFee(), listCountries().catch(() => [])]);
  // Live fare search runs only when real provider credentials are configured.
  // The flag below is read from the environment — never hardcoded.
  const providerConfigured = configStatus().configured;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">{t(locale, "flights.title")}</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-navy-600">{t(locale, "flights.intro")}</p>

      {user ? (
        <div className="mt-8 rounded-xl border border-navy-100 bg-white p-4 md:p-6">
          <FlightSearchPanel
            locale={locale}
            fee={
              fee
                ? { amount: fee.unitAmount, currency: fee.currency, labelEn: fee.labelEn, labelBn: fee.labelBn }
                : null
            }
            providerConfigured={providerConfigured}
          />
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-navy-100 bg-white p-6">
          <p className="text-base text-navy-700">{t(locale, "flights.loginRequired")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
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

      {countries.length > 0 ? (
        <p className="mt-8 text-sm text-navy-500">
          {t(locale, "flights.corridorsNote", { count: countries.length })}{" "}
          <Link href="/countries" className="font-medium underline">
            {t(locale, "nav.countries")}
          </Link>
        </p>
      ) : null}

      <p className="mt-4 text-sm text-navy-500">
        Wondering what a route usually costs? Browse our reviewed{" "}
        <Link href="/flights/fares" className="font-medium underline">
          worldwide fare references
        </Link>{" "}
        — historical observed prices with their sources, clearly not bookable quotes.
      </p>
    </div>
  );
}
