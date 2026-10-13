import { isSupabaseConfigured } from "@/lib/supabase/server";
import {
  listCountryFareRefs,
  listDerivedRoundTrips,
  getMatrixCoverage,
  getFareDisplaySettings,
  type CountryFareRefRow,
} from "@/lib/country-matrix-server";
import { listCountries } from "@/lib/catalog";
import { getPageNotice } from "@/lib/settings";

export const metadata = {
  title: "Worldwide route fare references — VisaBridge Global",
  description:
    "Historical observed one-way fares and derived round-trip references between countries, with their observation windows and sources. Not bookable prices — reconfirm with a live search.",
};

/**
 * Public fare-reference directory. ONLY verified rows exist here by RLS, so
 * every amount shown is a reviewed record with its observation window and
 * source. The derived round-trip table is labelled as derived, never as an
 * observed return ticket. Amounts display in EUR (original) plus an optional
 * converted figure through the documented, dated admin rate.
 */

function fmtEur(n: number | null): string {
  return n == null ? "—" : `€${Number(n).toFixed(2)}`;
}

export default async function PublicFaresPage() {
  // Public page — no staff gate. Verified-only visibility is enforced by RLS;
  // without a database the page says plainly that nothing is published yet.
  const configured = isSupabaseConfigured();
  const notice = await getPageNotice("en");

  if (!configured) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold text-navy-900">Worldwide route fare references</h1>
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Our fare reference catalogue is being connected to its database. Nothing is published yet — no
          prices are shown because none have been verified. Live quotes remain available on the flight search.
        </p>
      </div>
    );
  }

  const [settings, refs, derived, coverage, countries] = await Promise.all([
    getFareDisplaySettings(),
    listCountryFareRefs({ status: "verified", limit: 200 }),
    listDerivedRoundTrips({ status: "verified", limit: 100 }),
    getMatrixCoverage(),
    listCountries(),
  ]);
  const nameOf = new Map(countries.map((c) => [c.iso2, c.name_en] as const));
  const conversionOn = settings?.enabled === true && settings.rate_to_display > 0;
  const currency = settings?.display_currency ?? "EUR";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold text-navy-900">Worldwide route fare references</h1>
      <p className="mt-2 max-w-3xl text-sm text-navy-600">
        These are OBSERVED historical fares — what routes have actually cost, collected continuously from a
        published dataset ({refs.length > 0 || derived.length > 0 ? "CC-BY-4.0" : "see sources"}) and reviewed
        by our team. They are not today&apos;s bookable prices, not offers, and not a guarantee. Every journey
        must be reconfirmed with a live search or our agents before any booking.
      </p>

      {notice ? (
        <p className={`mt-3 rounded-md border px-4 py-3 text-sm ${notice.severity === "warning" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-sky-300 bg-sky-50 text-sky-900"}`}>
          {notice.messageEn}
        </p>
      ) : null}

      {/* Honest coverage summary */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-navy-100 bg-white p-3">
          <p className="text-xs text-navy-500">Countries in our matrix</p>
          <p className="text-xl font-bold">{coverage.countries ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-navy-100 bg-white p-3">
          <p className="text-xs text-navy-500">Pairs with reviewed one-way references</p>
          <p className="text-xl font-bold">{coverage.verifiedPairs ?? "0"}</p>
        </div>
        <div className="rounded-lg border border-navy-100 bg-white p-3">
          <p className="text-xs text-navy-500">Reviewed derived round-trip references</p>
          <p className="text-xl font-bold">{coverage.derivedRefs ?? "0"}</p>
        </div>
        <div className="rounded-lg border border-navy-100 bg-white p-3">
          <p className="text-xs text-navy-500">Pairs still awaiting research</p>
          <p className="text-xl font-bold">{coverage.needsResearchPairs ?? "—"}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-navy-500">
        &quot;Pairs awaiting research&quot; are real country pairs we list deliberately WITHOUT a price — we
        will not show an invented number.
      </p>

      {conversionOn && settings ? (
        <p className="mt-4 text-xs text-navy-500">
          For convenience, EUR originals are also shown in {currency} at the documented rate{" "}
          <strong>{Number(settings.rate_to_display)} {currency}/EUR</strong> ({settings.rate_source}, as of{" "}
          {settings.rate_as_of}). The EUR figure is the reference.
        </p>
      ) : null}

      <h2 className="mt-8 text-lg font-bold">Observed one-way references</h2>
      {refs.length === 0 ? (
        <p className="mt-2 rounded-md border border-navy-100 bg-white px-4 py-3 text-sm text-navy-600">
          No fares have completed review yet. When our team verifies a reference it appears here with its full
          observation window and source.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-navy-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-navy-50 text-left text-navy-600">
                <th className="px-4 py-2.5">Route</th>
                <th className="px-4 py-2.5">Lowest observed one-way</th>
                <th className="px-4 py-2.5">Median of that route</th>
                <th className="px-4 py-2.5">Observation window</th>
                <th className="px-4 py-2.5">Source</th>
              </tr>
            </thead>
            <tbody>
              {refs.map((r: CountryFareRefRow) => (
                <tr key={r.id} className="border-b border-navy-100 last:border-0">
                  <td className="px-4 py-3 text-xs font-semibold">
                    {nameOf.get(r.origin_iso) ?? r.origin_iso} → {nameOf.get(r.destination_iso) ?? r.destination_iso}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {fmtEur(r.amount)}
                    {conversionOn && r.amount != null ? (
                      <span className="block text-navy-400">
                        ≈ {Math.round(Number(r.amount) * Number(settings?.rate_to_display ?? 0)).toLocaleString()} {currency}
                      </span>
                    ) : null}
                    {r.lowest_city_pair ? (
                      <span className="block text-navy-400">via {r.lowest_city_pair}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs">{fmtEur(r.median_of_contributing_route)}</td>
                  <td className="px-4 py-3 text-xs">
                    {r.observation_from} → {r.observation_to}
                    {r.observation_count != null ? (
                      <span className="block text-navy-400">{r.observation_count.toLocaleString()} observations</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <a href={r.source_url ?? "#"} target="_blank" rel="noopener noreferrer" className="underline">
                      dataset source
                    </a>
                    <span className="block text-navy-400">{r.source_license}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8 text-lg font-bold">Derived round-trip references</h2>
      <p className="mt-1 max-w-3xl text-xs text-navy-500">
        A derived reference adds the two directional one-way medians. Airlines do not price return tickets as
        the sum of one-ways — treat these as a rough planning figure only, never as a return-ticket price.
      </p>
      {derived.length === 0 ? (
        <p className="mt-2 rounded-md border border-navy-100 bg-white px-4 py-3 text-sm text-navy-600">
          No derived references have completed review yet.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-navy-100 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-navy-50 text-left text-navy-600">
                <th className="px-4 py-2.5">Route</th>
                <th className="px-4 py-2.5">Derived round-trip reference</th>
                <th className="px-4 py-2.5">Outbound / inbound one-way medians</th>
              </tr>
            </thead>
            <tbody>
              {derived.map((d) => (
                <tr key={d.id} className="border-b border-navy-100 last:border-0">
                  <td className="px-4 py-3 text-xs font-semibold">
                    {nameOf.get(d.origin_iso) ?? d.origin_iso} → {nameOf.get(d.destination_iso) ?? d.destination_iso}
                  </td>
                  <td className="px-4 py-3 text-xs">{fmtEur(d.derived_amount)}</td>
                  <td className="px-4 py-3 text-xs">
                    {fmtEur(d.outbound_median)} / {fmtEur(d.inbound_median)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-8 rounded-md border border-navy-100 bg-white px-4 py-3 text-xs text-navy-500">
        Final prices and seat availability must be reconfirmed before booking — live searches, exact dates,
        cabin, baggage and taxes change every quote. Historic observations describe the past; they do not
        promise any future price.
      </p>
    </div>
  );
}
