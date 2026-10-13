import Link from "next/link";

interface Props {
  countries: { iso2: string; name: string }[];
  origin: string;
  dest: string;
}

/**
 * GET-form pair filter — server-side filtering of the review table via query
 * params, no client JS needed. Works without the database (the selects still
 * render; the table above just shows the no-rows state).
 */
export function FareMatrixBrowser({ countries, origin, dest }: Props) {
  return (
    <form method="get" className="mt-8 rounded-lg border border-navy-100 bg-white p-4">
      <h2 className="text-sm font-bold">Filter by country pair</h2>
      <p className="mt-1 text-xs text-navy-500">
        Choose origin and destination to filter the review queue. If no row appears, the pair has no fare
        record yet — research an observation and import it, or set a planning estimate deliberately.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-navy-600">
          Origin
          <select name="origin" defaultValue={origin} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
            <option value="">— any —</option>
            {countries.map((c) => (
              <option key={c.iso2} value={c.iso2}>{c.name} ({c.iso2})</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-navy-600">
          Destination
          <select name="dest" defaultValue={dest} className="mt-1 w-full rounded border border-navy-200 px-2 py-1.5 text-sm">
            <option value="">— any —</option>
            {countries.map((c) => (
              <option key={c.iso2} value={c.iso2}>{c.name} ({c.iso2})</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-xs font-semibold text-white">
          Apply filter
        </button>
        {origin || dest ? (
          <Link href="/admin/fare-matrix" className="rounded-md border border-navy-200 px-4 py-2 text-xs font-semibold text-navy-700">
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
