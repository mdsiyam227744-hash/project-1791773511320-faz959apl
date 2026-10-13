"use client";

/**
 * Airport autocomplete backed by the maintained dataset (server route
 * /api/airports — authenticated, rate-limited). Selecting a suggestion stores
 * the full row including verified coordinates, so distance is computed from
 * dataset coordinates rather than guessed. No hardcoded airport lists.
 */
import { useState, useRef, useEffect } from "react";
import { t, type Locale } from "@/lib/i18n";

export interface AirportSuggestion {
  id: string;
  name: string;
  city_municipality: string | null;
  iata_code: string | null;
  iso_country: string;
  latitude: number;
  longitude: number;
}

export function AirportPicker({
  label,
  placeholder,
  locale,
  value,
  onChange,
  inputId,
}: {
  label: string;
  placeholder: string;
  locale: Locale;
  value: AirportSuggestion | null;
  onChange: (a: AirportSuggestion | null) => void;
  inputId: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AirportSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && query === "") return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/airports?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const json = (await res.json()) as { results: AirportSuggestion[] };
          setResults(json.results ?? []);
          setOpen(true);
        }
      } catch {
        // aborted or network error — leave results as-is
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, value]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (value) {
    return (
      <div>
        <span className="mb-1 block text-sm font-medium text-navy-700">{label}</span>
        <div className="flex items-center justify-between gap-2 rounded-md border border-navy-200 bg-white px-3 py-2 text-sm">
          <span>
            <strong>{value.iata_code ?? value.name}</strong>{" "}
            <span className="text-navy-500">
              {value.name}
              {value.city_municipality ? `, ${value.city_municipality}` : ""} ({value.iso_country})
            </span>
          </span>
          <button
            type="button"
            className="text-xs font-medium text-navy-500 underline hover:text-navy-700"
            onClick={() => onChange(null)}
          >
            {t(locale, "common.clear")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-md border border-navy-200 px-3 py-2 text-base focus:border-[var(--brand-primary)] focus:outline-none"
      />
      {loading ? <p className="mt-1 text-xs text-navy-400">{t(locale, "common.loading")}</p> : null}
      {open && results.length > 0 ? (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-navy-200 bg-white shadow-lg"
        >
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="w-full px-3 py-2 text-left text-sm hover:bg-navy-50"
                onClick={() => {
                  onChange(r);
                  setQuery("");
                  setResults([]);
                  setOpen(false);
                }}
              >
                <strong>{r.iata_code ?? "—"}</strong> {r.name}
                <span className="block text-xs text-navy-500">
                  {r.city_municipality ?? ""} {r.city_municipality ? "," : ""} {r.iso_country}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
