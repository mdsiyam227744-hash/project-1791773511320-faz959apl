"use client";

/**
 * Airport-pair distance tool. Distances are computed server-side from dataset
 * coordinates and always labelled with the method. A country-pair note
 * explains that no country has a single flight distance — two airports must
 * be chosen. Nothing here derives a fare.
 */
import { useState } from "react";
import { AirportPicker, type AirportSuggestion } from "@/app/(site)/flights/airport-picker";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

interface DistanceResponse {
  ok: boolean;
  distanceKm: number | null;
  reason?: string;
  method?: string;
  earthRadiusKm?: number;
}

export function AirportDistanceTool({ initialFromId }: { initialFromId?: string }) {
  const locale = DEFAULT_LOCALE;
  const [from, setFrom] = useState<AirportSuggestion | null>(null);
  const [to, setTo] = useState<AirportSuggestion | null>(null);
  const [result, setResult] = useState<DistanceResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function calculate() {
    if (!from || !to) return;
    if (from.id === to.id) {
      setError(t(locale, "airports.distance.same"));
      setResult(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/distance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin_airport_id: from.id, destination_airport_id: to.id }),
      });
      if (!res.ok) {
        setError(t(locale, "common.error"));
        setResult(null);
        return;
      }
      setResult((await res.json()) as DistanceResponse);
    } catch {
      setError(t(locale, "common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-navy-900">{t(locale, "airports.distance.title")}</h1>
      <p className="mt-2 text-base text-navy-600">{t(locale, "airports.distance.intro")}</p>
      <p className="mt-3 rounded-md border border-navy-100 bg-navy-50 px-4 py-3 text-sm text-navy-600">
        {t(locale, "airports.countryPair.note")}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <AirportPicker
          label={t(locale, "airports.distance.origin")}
          placeholder="DAC, Hazrat Shahjalal…"
          locale={locale}
          value={from}
          onChange={(a) => {
            setFrom(a);
            setResult(null);
          }}
          inputId="distance-from"
        />
        <AirportPicker
          label={t(locale, "airports.distance.destination")}
          placeholder="LHR, Heathrow…"
          locale={locale}
          value={to}
          onChange={(a) => {
            setTo(a);
            setResult(null);
          }}
          inputId="distance-to"
        />
      </div>

      <button
        onClick={calculate}
        disabled={busy || !from || !to}
        className="mt-5 rounded-md bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? t(locale, "common.loading") : t(locale, "airports.distance.calculate")}
      </button>

      {error ? <p className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}

      {result ? (
        result.ok && result.distanceKm != null ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-medium text-emerald-800">{t(locale, "airports.distance.result")}</p>
            <p className="mt-1 text-3xl font-bold text-emerald-900">
              {Math.round(result.distanceKm).toLocaleString()} km
            </p>
            <p className="mt-2 text-xs text-emerald-800">
              {t(locale, "airports.distance.method")} · {from?.iata_code ?? ""} → {to?.iata_code ?? ""}
            </p>
          </div>
        ) : (
          <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {result.reason === "no_coordinates" || result.reason === "not_found"
              ? t(locale, "airports.distance.noCoords")
              : result.reason === "same_airport"
                ? t(locale, "airports.distance.same")
                : t(locale, "common.error")}
          </p>
        )
      ) : null}
    </div>
  );
}
