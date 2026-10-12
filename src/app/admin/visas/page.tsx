import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { listCountries, listCategories } from "@/lib/catalog";
import { upsertVisa, setVisaStatus } from "./actions";
import { CONTENT_STATUSES } from "../applications/shared";

export default async function AdminVisas() {
  await requireStaff();
  const supabase = createClient();
  const [countries, categories] = await Promise.all([listCountries(), listCategories()]);

  const { data: listings } = await supabase
    .from("visa_listings")
    .select(
      `id, slug, official_name_en, status, last_verified, category_code,
       destination:countries!inner(name_en),
       origin:countries(name_en)`,
    )
    .order("updated_at", { ascending: false })
    .limit(200);

  const destOptions = countries.filter((c) => c.is_destination);

  return (
    <div>
      <h1 className="text-2xl font-bold">Visa listings</h1>
      <p className="mt-1 text-sm text-navy-600">
        Every published listing should carry a source URL and verification date. Draft listings are
        hidden from the public site.
      </p>

      <section className="mt-4 overflow-x-auto rounded-lg border border-navy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-navy-50 text-left text-navy-600">
              <th className="px-4 py-2.5">Listing</th>
              <th className="px-4 py-2.5">Route</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Verified</th>
              <th className="px-4 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(listings ?? []).map((v) => (
              <tr key={v.id} className="border-b border-navy-100 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/visa/${v.slug}`} className="font-medium hover:underline">
                    {v.official_name_en}
                  </Link>
                  <p className="text-xs text-navy-400">{v.category_code}</p>
                </td>
                <td className="px-4 py-3 text-xs">
                  {v.origin ? `${v.origin.name_en} → ` : "— → "}
                  {v.destination?.name_en ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-navy-50 px-2 py-0.5 text-xs">{v.status}</span>
                </td>
                <td className="px-4 py-3 text-xs">{v.last_verified ?? "not verified"}</td>
                <td className="px-4 py-3">
                  <form action={setVisaStatus} className="flex items-center gap-1">
                    <input type="hidden" name="visa_id" value={v.id} />
                    <select name="status" defaultValue={v.status} className="rounded border border-navy-200 px-1.5 py-1 text-xs" aria-label="Set status">
                      {CONTENT_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <button className="rounded bg-[var(--brand-primary)] px-2 py-1 text-xs font-semibold text-white">
                      Set
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(listings ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-navy-500">No listings yet — create the first below.</p>
        ) : null}
      </section>

      <section className="mt-8 max-w-3xl">
        <h2 className="text-lg font-semibold">Create / update listing</h2>
        <form action={upsertVisa} className="mt-3 grid gap-3 rounded-lg border border-navy-100 bg-white p-5 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Official visa name</span>
            <input name="official_name_en" required className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Destination country</span>
            <select name="destination_iso2" required className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm">
              {destOptions.map((c) => (
                <option key={c.iso2} value={c.iso2}>{c.name_en}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Origin country (eligibility)</span>
            <select name="origin_iso2" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm">
              <option value="">Any / all nationalities</option>
              {countries.map((c) => (
                <option key={c.iso2} value={c.iso2}>{c.name_en}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Category</span>
            <select name="category_code" required className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm">
              {categories.map((c) => (
                <option key={c.code} value={c.code}>{c.label_en}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Slug (unique, e.g. bd-thailand-tourist)</span>
            <input name="slug" required pattern="[a-z0-9-]+" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Official URL (source)</span>
            <input name="official_url" type="url" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Processing time estimate</span>
            <input name="processing_time_estimate" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Fee currency (e.g. USD)</span>
            <input name="fee_currency" maxLength={3} className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Summary</span>
            <textarea name="summary_en" rows={2} className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Eligibility</span>
            <textarea name="eligibility_en" rows={2} className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Required documents</span>
            <textarea name="required_documents_en" rows={2} className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Application steps</span>
            <textarea name="application_steps_en" rows={2} className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Validity</span>
            <input name="validity" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Permitted stay</span>
            <input name="permitted_stay" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Work authorization restrictions</span>
            <input name="work_authorization" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">
            Save listing (as draft)
          </button>
        </form>
      </section>
    </div>
  );
}
