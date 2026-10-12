import { requireStaff } from "@/lib/auth";
import { listCountries } from "@/lib/catalog";
import { createCountry, toggleCountryFlags } from "./actions";

export default async function AdminCountries() {
  await requireStaff();
  const countries = await listCountries();

  return (
    <div>
      <h1 className="text-2xl font-bold">Countries</h1>
      <p className="mt-1 text-sm text-navy-600">
        The worldwide directory. Add countries at any time — no code changes needed.
      </p>

      <section className="mt-4 overflow-x-auto rounded-lg border border-navy-100 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-navy-50 text-left text-navy-600">
              <th className="px-4 py-2.5">Country</th>
              <th className="px-4 py-2.5">Region</th>
              <th className="px-4 py-2.5">Origin</th>
              <th className="px-4 py-2.5">Destination</th>
            </tr>
          </thead>
          <tbody>
            {countries.map((c) => (
              <tr key={c.id} className="border-b border-navy-100 last:border-0">
                <td className="px-4 py-2.5">
                  {c.name_en} <span className="text-xs text-navy-400">{c.iso2}</span>
                </td>
                <td className="px-4 py-2.5 text-xs">{c.region ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <form action={toggleCountryFlags}>
                    <input type="hidden" name="country_id" value={c.id} />
                    <input type="hidden" name="field" value="is_origin" />
                    <input type="hidden" name="value" value={c.is_origin ? "false" : "true"} />
                    <button className="rounded px-2 py-1 text-xs hover:bg-navy-50">
                      {c.is_origin ? "✓ yes" : "— no"}
                    </button>
                  </form>
                </td>
                <td className="px-4 py-2.5">
                  <form action={toggleCountryFlags}>
                    <input type="hidden" name="country_id" value={c.id} />
                    <input type="hidden" name="field" value="is_destination" />
                    <input type="hidden" name="value" value={c.is_destination ? "false" : "true"} />
                    <button className="rounded px-2 py-1 text-xs hover:bg-navy-50">
                      {c.is_destination ? "✓ yes" : "— no"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-8 max-w-xl">
        <h2 className="text-lg font-semibold">Add a country</h2>
        <form action={createCountry} className="mt-3 grid gap-3 rounded-lg border border-navy-100 bg-white p-5 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Name (English)</span>
            <input name="name_en" required className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">ISO 3166-1 alpha-2 code</span>
            <input name="iso2" required maxLength={2} pattern="[A-Za-z]{2}" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm uppercase" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Nationality (English)</span>
            <input name="nationality_en" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Region</span>
            <input name="region" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Name (Bangla, optional)</span>
            <input name="name_bn" className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm" />
          </label>
          <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">
            Add country
          </button>
        </form>
      </section>
    </div>
  );
}
