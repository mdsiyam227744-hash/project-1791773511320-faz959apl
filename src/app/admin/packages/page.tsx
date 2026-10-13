import { requireStaff } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { listCountries, listCategories } from "@/lib/catalog";
import { saveVisaPackage } from "../aviation-actions";

export const metadata = { title: "Visa packages — Admin" };

interface PkgRow {
  id: string;
  slug: string;
  name_en: string;
  tier: string;
  category_code: string;
  status: string;
  service_fee_amount: number;
  service_fee_currency: string;
  official_gov_fee_amount: number | null;
  official_gov_fee_verified: boolean;
  destination?: { name_en: string } | null;
  origin?: { name_en: string } | null;
}

export default async function AdminPackagesPage() {
  await requireStaff(["super_admin", "application_manager"]);
  const configured = isSupabaseConfigured();
  const countries = await listCountries();
  const categories = await listCategories();

  const supabase = createClient();
  const { data } = configured
    ? await supabase
        .from("visa_packages")
        .select(
          "id, slug, name_en, tier, category_code, status, service_fee_amount, service_fee_currency, official_gov_fee_amount, official_gov_fee_verified, destination:countries!visa_packages_destination_country_id_fkey(name_en), origin:countries!visa_packages_origin_country_id_fkey(name_en)",
        )
        .order("updated_at", { ascending: false })
        .limit(100)
    : { data: [] };
  const packages = (data ?? []) as unknown as PkgRow[];

  return (
    <div>
      <h1 className="text-2xl font-bold">Visa packages & pricing</h1>
      <p className="mt-1 max-w-3xl text-sm text-navy-600">
        Database-backed packages configured per destination, corridor, category, and tier. Government fees and
        the VisaBridge service fee are separate lines everywhere; a government fee is shown as verified only
        when you record its official source. Publish only packages whose scope you can actually deliver.
      </p>

      {!configured ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Database not connected yet — packages cannot be listed or saved until provisioning completes.
        </p>
      ) : null}

      <details className="mt-4 rounded-lg border border-navy-100 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold">Create a package</summary>
        <form action={saveVisaPackage} className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-medium text-navy-600">
            Name (English) *
            <input name="name_en" required maxLength={160} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Name (Bangla)
            <input name="name_bn" maxLength={160} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Destination country *
            <select name="destination_country_id" required className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
              <option value="">— choose —</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.name_en}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-navy-600">
            Origin country (corridor-specific; optional)
            <select name="origin_country_id" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
              <option value="">— any origin —</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.name_en}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-navy-600">
            Visa category *
            <select name="category_code" required className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
              {categories.map((c) => (
                <option key={c.code} value={c.code}>{c.label_en}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-navy-600">
            Tier
            <select name="tier" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
              <option value="basic">basic</option>
              <option value="standard" selected>standard</option>
              <option value="premium">premium</option>
            </select>
          </label>
          <label className="text-xs font-medium text-navy-600">
            Service fee (VisaBridge revenue) *
            <input name="service_fee" required inputMode="decimal" pattern="\d+(\.\d{1,2})?" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Service-fee currency *
            <input name="service_fee_currency" required maxLength={3} defaultValue="USD" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm uppercase" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Official government fee (optional; paid to the government)
            <input name="gov_fee" inputMode="decimal" pattern="\d+(\.\d{1,2})?" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Government-fee currency
            <input name="gov_fee_currency" maxLength={3} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm uppercase" />
          </label>
          <label className="text-xs font-medium text-navy-600 md:col-span-2">
            Government-fee source URL (required when marking the fee verified)
            <input name="gov_fee_source" type="url" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Government fee verified?
            <select name="gov_fee_verified" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
              <option value="false">no — display as unverified</option>
              <option value="true">yes — verified with the source above</option>
            </select>
          </label>
          <label className="text-xs font-medium text-navy-600">
            Tax note
            <input name="tax_note" maxLength={300} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600 md:col-span-2">
            Included services (English)
            <textarea name="included_en" rows={2} maxLength={2000} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600 md:col-span-2">
            Included services (Bangla)
            <textarea name="included_bn" rows={2} maxLength={2000} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600 md:col-span-2">
            Excluded services
            <textarea name="excluded_en" rows={2} maxLength={2000} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600 md:col-span-2">
            Required documents
            <textarea name="required_docs_en" rows={2} maxLength={2000} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600 md:col-span-2">
            Third-party costs (note shown to the customer)
            <input name="third_party_en" maxLength={400} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Our service timeline (distinct from the government's processing time)
            <input name="timeline_en" maxLength={300} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Refund / cancellation terms
            <input name="refund_en" maxLength={1000} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600 md:col-span-2">
            Eligibility notes
            <input name="eligibility_en" maxLength={1000} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-navy-600">
            Status
            <select name="status" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
              <option value="draft">draft (not public)</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <label className="text-xs font-medium text-navy-600">
            Effective from
            <input name="effective_from" type="date" className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm" />
          </label>
          <div className="md:col-span-2">
            <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white">
              Save package
            </button>
          </div>
        </form>
      </details>

      <h2 className="mt-8 text-lg font-bold">Existing packages</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-navy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-navy-50 text-left text-navy-600">
              <th className="px-4 py-2.5">Package</th>
              <th className="px-4 py-2.5">Corridor</th>
              <th className="px-4 py-2.5">Category / tier</th>
              <th className="px-4 py-2.5">Service fee</th>
              <th className="px-4 py-2.5">Gov fee</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p.id} className="border-b border-navy-100 last:border-0">
                <td className="px-4 py-3">
                  {p.name_en}
                  <span className="block text-xs text-navy-400">{p.slug}</span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {p.origin?.name_en ?? "Any origin"} → {p.destination?.name_en ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs">{p.category_code} · {p.tier}</td>
                <td className="px-4 py-3 text-xs">{p.service_fee_amount} {p.service_fee_currency}</td>
                <td className="px-4 py-3 text-xs">
                  {p.official_gov_fee_amount != null ? (
                    <>
                      {p.official_gov_fee_amount}
                      {p.official_gov_fee_verified ? (
                        <span className="ml-1 text-emerald-700">verified</span>
                      ) : (
                        <span className="ml-1 text-amber-700">unverified</span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-xs">{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {configured && packages.length === 0 ? (
          <p className="p-6 text-center text-sm text-navy-500">
            No packages yet — create one above. It becomes public only when its status is published.
          </p>
        ) : null}
      </div>
    </div>
  );
}
