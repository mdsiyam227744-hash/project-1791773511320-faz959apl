"use client";

/**
 * Client-side corridor search over the country list the server fetched.
 * Both selects always stay populated (from the real database rows), so the
 * bug "no searchable results" cannot occur from an empty dependent render:
 * filtering only narrows which cards are shown, never the options themselves.
 */
import { useMemo, useState } from "react";
import Link from "next/link";

export interface CorridorCountry {
  id: string;
  iso2: string;
  name_en: string;
  name_bn: string | null;
  region: string | null;
}

export function CorridorSearch({
  countries,
  destinationLabel,
  originLabel,
  searchLabel,
  clearLabel,
  noneLabel,
}: {
  countries: CorridorCountry[];
  destinationLabel: string;
  originLabel: string;
  searchLabel: string;
  clearLabel: string;
  noneLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");

  const regions = useMemo(
    () => [...new Set(countries.map((c) => c.region).filter((r): r is string => Boolean(r)))].sort(),
    [countries],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return countries.filter((c) => {
      if (q && !(`${c.name_en} ${c.name_bn ?? ""}`.toLowerCase().includes(q))) return false;
      if (origin && c.region !== origin) return false;
      if (destination && c.iso2 === destination) return false;
      return true;
    });
  }, [countries, query, origin, destination]);

  const byRegion = useMemo(() => {
    const m = new Map<string, CorridorCountry[]>();
    for (const c of filtered) {
      const r = c.region ?? "Other";
      if (!m.has(r)) m.set(r, []);
      m.get(r)!.push(c);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
        <div>
          <label htmlFor="corridor-q" className="mb-1 block text-sm font-medium text-navy-700">
            {searchLabel}
          </label>
          <input
            id="corridor-q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bangladesh, Canada, জাপান…"
            className="w-full rounded-md border border-navy-200 px-3 py-2 text-base focus:border-[var(--brand-primary)] focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="corridor-region" className="mb-1 block text-sm font-medium text-navy-700">
            {originLabel}
          </label>
          <select
            id="corridor-region"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="w-full rounded-md border border-navy-200 px-3 py-2 text-base focus:border-[var(--brand-primary)] focus:outline-none"
          >
            <option value="">—</option>
            {regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="corridor-dest" className="mb-1 block text-sm font-medium text-navy-700">
            {destinationLabel}
          </label>
          <select
            id="corridor-dest"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="w-full rounded-md border border-navy-200 px-3 py-2 text-base focus:border-[var(--brand-primary)] focus:outline-none"
          >
            <option value="">—</option>
            {countries.map((c) => (
              <option key={c.iso2} value={c.iso2}>
                {c.name_en}
              </option>
            ))}
          </select>
          {destination ? (
            <p className="mt-1 text-xs text-navy-500">
              {noneLabel}: <strong>{countries.find((c) => c.iso2 === destination)?.name_en}</strong>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setOrigin("");
            setDestination("");
          }}
          className="rounded-md border border-navy-200 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50"
        >
          {clearLabel}
        </button>
      </div>

      <p className="mt-3 text-sm text-navy-500" role="status">
        {filtered.length} / {countries.length}
      </p>

      {byRegion.map(([region, list]) => (
        <section key={region} className="mt-6">
          <h2 className="text-lg font-semibold text-navy-800">{region}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/visa-categories?country=${c.iso2}`}
                  className="flex items-center justify-between rounded-lg border border-navy-100 px-4 py-3 text-sm hover:border-[var(--brand-secondary)]"
                >
                  <span>{c.name_en}</span>
                  <span className="text-xs uppercase tracking-wider text-navy-400">{c.iso2}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
