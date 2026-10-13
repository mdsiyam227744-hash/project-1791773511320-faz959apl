import { requireStaff } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { listCountries } from "@/lib/catalog";
import {
  listCountryFareRefs,
  listDerivedRoundTrips,
  listFareMappingReview,
  getMatrixCoverage,
} from "@/lib/country-matrix-server";
import {
  reviewCountryFareRef,
  reviewDerivedRef,
  resolveFareMapping,
  setPlanningEstimate,
  clearPlanningEstimate,
  saveFareDisplaySettings,
} from "./actions";
import { FareCsvImportPanel, ExportButton } from "./matrix-forms";
import { FareMatrixBrowser } from "./matrix-browser";

export const metadata = { title: "Country fare matrix — Admin" };

interface PageProps {
  searchParams: Promise<{ origin?: string; dest?: string }>;
}

/**
 * Worldwide country-pair fare reference system: browse the matrix, review
 * observed references, resolve ambiguous city mappings, set planning
 * estimates, and bulk-import. Every number shown comes from stored records —
 * the "matrix size" counter is the generated pair count, not coverage.
 */
export default async function AdminFareMatrixPage({ searchParams }: PageProps) {
  await requireStaff(["super_admin", "application_manager", "content_manager", "support_agent"]);
  const sp = await searchParams;
  const origin = (sp.origin ?? "").toUpperCase();
  const dest = (sp.dest ?? "").toUpperCase();
  const configured = isSupabaseConfigured();
  const [countries, coverage, refs, derived, cityReviews] = await Promise.all([
    listCountries(),
    getMatrixCoverage(),
    listCountryFareRefs({
      limit: 150,
      originIso: /^[A-Z]{2}$/.test(origin) ? origin : undefined,
      destinationIso: /^[A-Z]{2}$/.test(dest) ? dest : undefined,
    }),
    listDerivedRoundTrips({ limit: 50 }),
    listFareMappingReview({ openOnly: true, limit: 40 }),
  ]);
  const countryByIso = new Map(countries.map((c) => [c.iso2, c] as const));
  const nameOf = (iso: string) => countryByIso.get(iso)?.name_en ?? iso;

  return (
    <div>
      <h1 className="text-2xl font-bold">Country fare matrix</h1>
      <p className="mt-1 max-w-3xl text-sm text-navy-600">
        One record per ordered country pair. Amounts are OBSERVED historical one-way fares in EUR from the
        flight-fare-history dataset — never today&apos;s bookable price. Round-trip figures are DERIVED sums of
        two one-way medians, never observed return tickets. Only rows you verify become visible to customers.
      </p>

      {!configured ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Database not connected yet — the matrix cannot be listed or edited until provisioning completes. All
          local tooling (migration, seed, import script) is ready to apply on connection.
        </p>
      ) : null}

      {/* Honest coverage counters */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Served countries", value: coverage.countries },
          { label: "Matrix pairs (generated)", value: coverage.matrixPairs },
          { label: "Pairs with observed one-way data", value: coverage.observedPairs },
          { label: "Derived round-trip refs (verified)", value: coverage.derivedRefs },
          { label: "Pairs needing research", value: coverage.needsResearchPairs },
          { label: "Awaiting review", value: coverage.awaitingReview },
          { label: "Verified (customer-visible)", value: coverage.verifiedPairs },
          { label: "City names to resolve", value: coverage.openCityReviews },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-navy-100 bg-white p-3">
            <p className="text-xs text-navy-500">{c.label}</p>
            <p className="mt-1 text-xl font-bold text-navy-900">
              {c.value ?? "—"}
              {c.value == null ? "" : ""}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <FareCsvImportPanel />
        <div className="rounded-lg border border-navy-100 bg-white p-4">
          <h3 className="text-sm font-bold">Export & display settings</h3>
          <div className="mt-3">
            <ExportButton />
          </div>
          <form action={saveFareDisplaySettings} className="mt-4 grid gap-2 sm:grid-cols-2">
            <p className="sm:col-span-2 text-xs text-navy-500">
              Public display currency — EUR originals are always preserved; this only sets how they are
              converted for display. The rate source and date are shown to customers.
            </p>
            <label className="text-xs font-medium text-navy-600">
              Display currency
              <input name="display_currency" maxLength={3} defaultValue="BDT" required
                className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm uppercase" />
            </label>
            <label className="text-xs font-medium text-navy-600">
              Rate per 1 EUR
              <input name="rate_to_display" defaultValue="132.50" required inputMode="decimal"
                className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-medium text-navy-600 sm:col-span-2">
              Rate source (documented, shown publicly)
              <input name="rate_source" defaultValue="" placeholder="e.g. Bangladesh Bank published rate, 2026-10-13"
                className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-medium text-navy-600">
              Rate as of
              <input name="rate_as_of" type="date" required
                className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-medium text-navy-600">
              Show references publicly
              <select name="enabled" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
                <option value="false">hidden until enabled</option>
                <option value="true">enabled</option>
              </select>
            </label>
            <div className="sm:col-span-2">
              <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-xs font-semibold text-white">
                Save display settings
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Planning estimate */}
      <details className="mt-4 rounded-lg border border-navy-100 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Set a planning estimate (pair with no observed price)
        </summary>
        <p className="mt-2 text-xs text-navy-500">
          Estimates are stored SEPARATELY from observed prices — never displayed as a fare, never used to issue
          a booking. They appear publicly only when display settings enable estimates, and always labelled
          &quot;administrator estimate&quot;.
        </p>
        <form action={setPlanningEstimate} className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-medium text-navy-600">
            Origin country (ISO-2)
            <input name="origin_iso" maxLength={2} required placeholder="BD"
              className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm uppercase" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Destination country (ISO-2)
            <input name="destination_iso" maxLength={2} required placeholder="GB"
              className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm uppercase" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Estimate amount (EUR)
            <input name="amount" required inputMode="decimal" pattern="\d+(\.\d{1,2})?"
              className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Estimation method (required)
            <input name="method" required maxLength={400} placeholder="e.g. historical median of the region corridor"
              className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600 md:col-span-2">
            Assumptions
            <input name="assumptions" maxLength={400} placeholder="1 adult, economy, 30-day advance purchase…"
              className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <div className="md:col-span-2">
            <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-xs font-semibold text-white">
              Save estimate
            </button>
          </div>
        </form>
      </details>

      {/* Review queue */}
      <h2 className="mt-8 text-lg font-bold">Observed one-way references — review queue</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-navy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-navy-50 text-left text-navy-600">
              <th className="px-4 py-2.5">Pair</th>
              <th className="px-4 py-2.5">Lowest observed (EUR)</th>
              <th className="px-4 py-2.5">Median of that route</th>
              <th className="px-4 py-2.5">Window</th>
              <th className="px-4 py-2.5">State</th>
              <th className="px-4 py-2.5">Source</th>
              <th className="px-4 py-2.5">Decision</th>
            </tr>
          </thead>
          <tbody>
            {refs.map((r) => (
              <tr key={r.id} className="border-b border-navy-100 last:border-0">
                <td className="px-4 py-3 text-xs font-semibold">
                  {r.origin_iso} → {r.destination_iso}
                  <span className="block font-normal text-navy-400">
                    {nameOf(r.origin_iso)} → {nameOf(r.destination_iso)}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {r.amount != null ? (
                    <>
                      €{Number(r.amount).toFixed(2)}
                      <span className="block text-navy-400">{r.lowest_city_pair}</span>
                    </>
                  ) : (
                    <span className="text-navy-400">no amount</span>
                  )}
                  {r.observation_count != null ? (
                    <span className="block text-navy-400">{r.observation_count.toLocaleString()} observations</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs">
                  {r.median_of_contributing_route != null ? `€${Number(r.median_of_contributing_route).toFixed(2)}` : "—"}
                </td>
                <td className="px-4 py-3 text-xs">
                  {r.observation_from ?? "—"} → {r.observation_to ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs font-semibold">
                  <span className={r.verification_status === "verified" ? "text-emerald-700" : r.verification_status === "needs_review" ? "text-sky-700" : "text-navy-500"}>
                    {r.verification_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {r.source_url ? (
                    <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="underline">source</a>
                  ) : (
                    "—"
                  )}
                  <span className="block text-navy-400">{r.source_license ?? ""}</span>
                </td>
                <td className="px-4 py-3">
                  <form action={reviewCountryFareRef} className="flex flex-wrap gap-1">
                    <input type="hidden" name="ref_id" value={r.id} />
                    <button name="decision" value="verified" className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white">Verify</button>
                    <button name="decision" value="rejected" className="rounded border border-red-300 px-2 py-1 text-xs text-red-700">Reject</button>
                    <button name="decision" value="needs_review" className="rounded border border-sky-300 px-2 py-1 text-xs text-sky-700">Back to review</button>
                  </form>
                  {r.fare_kind === "needs_research" && r.review_note ? (
                    <form action={clearPlanningEstimate} className="mt-1">
                      <input type="hidden" name="ref_id" value={r.id} />
                      <button className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-700">
                        Clear estimate
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {configured && refs.length === 0 ? (
          <p className="p-6 text-center text-sm text-navy-500">
            No rows yet — run scripts/load-fare-history.mjs and apply the generated seed after the database connects.
          </p>
        ) : null}
      </div>

      {/* Derived round trips */}
      <h2 className="mt-8 text-lg font-bold">Derived round-trip references</h2>
      <p className="mt-1 max-w-3xl text-xs text-navy-500">
        Sum of the two directional one-way MEDIANS. This is NOT an observed return ticket price.
      </p>
      <div className="mt-3 overflow-x-auto rounded-lg border border-navy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-navy-50 text-left text-navy-600">
              <th className="px-4 py-2.5">Pair</th>
              <th className="px-4 py-2.5">Derived (EUR)</th>
              <th className="px-4 py-2.5">Out / in medians</th>
              <th className="px-4 py-2.5">State</th>
              <th className="px-4 py-2.5">Decision</th>
            </tr>
          </thead>
          <tbody>
            {derived.map((d) => (
              <tr key={d.id} className="border-b border-navy-100 last:border-0">
                <td className="px-4 py-3 text-xs font-semibold">
                  {d.origin_iso} → {d.destination_iso}
                </td>
                <td className="px-4 py-3 text-xs">€{Number(d.derived_amount).toFixed(2)}</td>
                <td className="px-4 py-3 text-xs">
                  €{Number(d.outbound_median).toFixed(2)} / €{Number(d.inbound_median).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-xs font-semibold">
                  <span className={d.verification_status === "verified" ? "text-emerald-700" : "text-sky-700"}>
                    {d.verification_status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <form action={reviewDerivedRef} className="flex flex-wrap gap-1">
                    <input type="hidden" name="ref_id" value={d.id} />
                    <button name="decision" value="verified" className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white">Verify</button>
                    <button name="decision" value="rejected" className="rounded border border-red-300 px-2 py-1 text-xs text-red-700">Reject</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {configured && derived.length === 0 ? (
          <p className="p-6 text-center text-sm text-navy-500">No derived references yet.</p>
        ) : null}
      </div>

      {/* City mapping review */}
      <h2 className="mt-8 text-lg font-bold">City-name mapping review</h2>
      <p className="mt-1 max-w-3xl text-xs text-navy-500">
        Dataset city names that matched no airport municipality — or more than one country. Nothing is guessed:
        resolve each name to its country, or leave it unresolved (its routes stay out of the published matrix).
      </p>
      <div className="mt-3 mb-12 overflow-x-auto rounded-lg border border-navy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-navy-50 text-left text-navy-600">
              <th className="px-4 py-2.5">City (as spelled in dataset)</th>
              <th className="px-4 py-2.5">Kind</th>
              <th className="px-4 py-2.5">Candidate countries</th>
              <th className="px-4 py-2.5">Routes affected</th>
              <th className="px-4 py-2.5">Resolve to</th>
            </tr>
          </thead>
          <tbody>
            {cityReviews.map((m) => (
              <tr key={m.id} className="border-b border-navy-100 last:border-0">
                <td className="px-4 py-3 text-xs font-semibold">{m.city_name}</td>
                <td className="px-4 py-3 text-xs">{m.match_kind}</td>
                <td className="px-4 py-3 text-xs">{m.possible_countries ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{m.dataset_routes}</td>
                <td className="px-4 py-3">
                  <form action={resolveFareMapping} className="flex gap-1">
                    <input type="hidden" name="review_id" value={m.id} />
                    <input name="country" maxLength={2} required placeholder="ISO" aria-label={`Country for ${m.city_name}`}
                      className="w-16 rounded border border-navy-200 px-2 py-1 text-xs uppercase" />
                    <button className="rounded bg-[var(--brand-primary)] px-2 py-1 text-xs font-semibold text-white">
                      Resolve
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {configured && cityReviews.length === 0 ? (
          <p className="p-6 text-center text-sm text-navy-500">No open city-name mappings.</p>
        ) : null}
      </div>

      <FareMatrixBrowser countries={countries.map((c) => ({ iso2: c.iso2, name: c.name_en }))} origin={origin} dest={dest} />
    </div>
  );
}
