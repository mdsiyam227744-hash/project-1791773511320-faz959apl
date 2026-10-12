"use client";

import { useState } from "react";
import { listCountries, type Country } from "@/lib/catalog";
import { useEffect } from "react";

interface PlannerResponse {
  distanceKm: number | null;
  distanceSource: string;
  fare: {
    available: boolean;
    reason?: string;
    quotes: { airline: string; price: number; currency: string; stops: number }[];
    retrievedAt: string;
  };
  fees: { label: string; amount: number | null; currency: string | null; verified: boolean }[];
  serviceFee: { label: string; amount: number; currency: string } | null;
  total: number | null;
  note: string | null;
  error?: string;
}

export default function PlannerForm() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [originCity, setOriginCity] = useState("");
  const [destCity, setDestCity] = useState("");
  const [date, setDate] = useState("");
  const [result, setResult] = useState<PlannerResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/countries")
      .then((r) => (r.ok ? r.json() : { countries: [] }))
      .then((d) => setCountries(d.countries ?? []))
      .catch(() => setCountries([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/route-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin_country: origin,
          destination_country: dest,
          origin_city: originCity,
          destination_city: destCity,
          travel_date: date || null,
        }),
      });
      setResult(await res.json());
    } catch {
      setResult({ distanceKm: null, distanceSource: "", fare: { available: false, quotes: [], retrievedAt: "" }, fees: [], serviceFee: null, total: null, note: null, error: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-navy-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)]";

  return (
    <div className="mt-8">
      <form onSubmit={submit} className="grid gap-4 rounded-xl border border-navy-100 p-5 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Departure country</span>
          <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={inputCls} required>
            <option value="">Select…</option>
            {countries.map((c) => (
              <option key={c.id} value={c.iso2}>{c.name_en}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Destination country</span>
          <select value={dest} onChange={(e) => setDest(e.target.value)} className={inputCls} required>
            <option value="">Select…</option>
            {countries.map((c) => (
              <option key={c.id} value={c.iso2}>{c.name_en}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Departure city</span>
          <input value={originCity} onChange={(e) => setOriginCity(e.target.value)} className={inputCls} placeholder="e.g. Dhaka" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Destination city</span>
          <input value={destCity} onChange={(e) => setDestCity(e.target.value)} className={inputCls} placeholder="e.g. Bangkok" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Travel date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Checking…" : "Estimate route & costs"}
          </button>
        </div>
      </form>

      {result ? (
        <section className="mt-8 rounded-xl border border-navy-100 p-5" aria-live="polite">
          <h2 className="text-lg font-semibold">Results</h2>
          {result.error ? (
            <p className="mt-2 text-sm text-red-700">{result.error}</p>
          ) : (
            <>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-navy-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-navy-500">Approx. distance</p>
                  <p className="text-2xl font-bold">
                    {result.distanceKm !== null ? `${Math.round(result.distanceKm).toLocaleString()} km` : "—"}
                  </p>
                  <p className="mt-1 text-xs text-navy-500">
                    Great-circle distance between city coordinates — actual flown distance is
                    usually longer.
                  </p>
                </div>
                <div className="rounded-lg bg-navy-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-navy-500">Live flight fares</p>
                  {result.fare.available && result.fare.quotes.length > 0 ? (
                    <ul className="mt-1 space-y-1 text-sm">
                      {result.fare.quotes.map((q, i) => (
                        <li key={i} className="flex justify-between">
                          <span>
                            {q.airline} · {q.stops === 0 ? "Direct" : `${q.stops} stop`}
                          </span>
                          <span className="font-medium">
                            {q.price} {q.currency}
                          </span>
                        </li>
                      ))}
                      <li className="text-xs text-navy-500">
                        Retrieved {new Date(result.fare.retrievedAt).toLocaleString()} — revalidated
                        before any booking.
                      </li>
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-navy-700">
                      Live fare unavailable — request a quote. Our team confirms current fares with
                      airlines directly.
                    </p>
                  )}
                </div>
              </div>

              <h3 className="mt-6 font-semibold">Cost breakdown</h3>
              <ul className="mt-2 text-sm">
                {result.fees.map((f, i) => (
                  <li key={i} className="flex justify-between border-b border-navy-100 py-1.5">
                    <span>
                      {f.label}{" "}
                      {f.verified ? null : (
                        <span className="text-xs text-gold-700">(not verified)</span>
                      )}
                    </span>
                    <span>{f.amount !== null ? `${f.amount} ${f.currency}` : "—"}</span>
                  </li>
                ))}
                {result.serviceFee ? (
                  <li className="flex justify-between border-b border-navy-100 py-1.5">
                    <span>{result.serviceFee.label} (our fee)</span>
                    <span>
                      {result.serviceFee.amount} {result.serviceFee.currency}
                    </span>
                  </li>
                ) : null}
                <li className="flex justify-between py-2 font-semibold">
                  <span>Total</span>
                  <span>
                    {result.total !== null ? `${result.total} ${result.fees[0]?.currency ?? ""}` : "—"}
                  </span>
                </li>
              </ul>
              {result.note === "official_fee_not_verified" ? (
                <p className="mt-2 rounded bg-gold-50 p-2 text-xs text-gold-800">
                  The official government fee for this route is not verified yet, so no confirmed
                  total is shown. Contact us for the latest fee.
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
