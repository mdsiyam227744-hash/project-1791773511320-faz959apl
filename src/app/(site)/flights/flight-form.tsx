"use client";

/**
 * Flight booking-assistance request form.
 * - Airport autocomplete against the maintained dataset (no hardcoded lists).
 * - Great-circle distance shown, clearly labelled as approximate geographic
 *   distance between airports — never as a flight path, and never priced.
 * - No fares are displayed unless a live provider supplied them (it does not
 *   today, so the honest unconfigured notice is shown instead).
 */
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { haversineKm } from "@/lib/geo";

interface Suggestion {
  id: string;
  name: string;
  city_municipality: string | null;
  iata_code: string | null;
  iso_country: string;
  latitude: number;
  longitude: number;
}

function AirportPicker({
  label,
  placeholder,
  locale,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  locale: Locale;
  value: Suggestion | null;
  onChange: (a: Suggestion | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
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
          const json = (await res.json()) as { results: Suggestion[] };
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
      <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor={`ap-${label}`}>
        {label}
      </label>
      <input
        id={`ap-${label}`}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
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

export function FlightRequestForm({
  locale,
  fee,
  providerConfigured,
  countries,
}: {
  locale: Locale;
  fee: { amount: number; currency: string; labelEn: string; labelBn: string } | null;
  providerConfigured: boolean;
  countries: { iso2: string; name: string }[];
}) {
  const router = useRouter();
  const [origin, setOrigin] = useState<Suggestion | null>(null);
  const [dest, setDest] = useState<Suggestion | null>(null);
  const [tripType, setTripType] = useState<"one_way" | "return">("one_way");
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [cabin, setCabin] = useState("economy");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [imo, setImo] = useState("");
  const [notes, setNotes] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const distanceKm =
    origin && dest ? Math.round(haversineKm(origin.latitude, origin.longitude, dest.latitude, dest.longitude)) : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!origin || !dest) {
      setError(locale === "bn" ? "দুটি বিমানবন্দরই নির্বাচন করুন।" : "Please select both airports.");
      return;
    }
    if (!departDate) {
      setError(locale === "bn" ? "যাত্রার তারিখ দিন।" : "Please choose a departure date.");
      return;
    }
    if (!accepted) {
      setError(locale === "bn" ? "শর্তাবলি স্বীকার করুন।" : "Please accept the service terms.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originAirportId: origin.id,
          destinationAirportId: dest.id,
          originCountry: origin.iso_country,
          destinationCountry: dest.iso_country,
          departDate,
          returnDate: tripType === "return" ? returnDate || null : null,
          tripType,
          passengers,
          cabinClass: cabin,
          contactPhone: phone,
          contactWhatsapp: whatsapp || null,
          contactImo: imo || null,
          notes: notes || null,
        }),
      });
      const json = (await res.json()) as { orderId?: string; error?: string };
      if (!res.ok || !json.orderId) {
        setError(
          json.error === "rate_limited"
            ? locale === "bn" ? "অনেক বেশি অনুরোধ। এক মিনিট পর চেষ্টা করুন।" : "Too many requests. Try again in a minute."
            : locale === "bn" ? "অনুরোধ পাঠানো যায়নি। আবার চেষ্টা করুন।" : "Could not submit the request. Please try again.",
        );
        return;
      }
      router.push(`/account/orders/${json.orderId}`);
    } catch {
      setError(locale === "bn" ? "নেটওয়ার্ক সমস্যা। আবার চেষ্টা করুন।" : "Network problem. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-navy-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <AirportPicker
          label={t(locale, "flights.originAirport")}
          placeholder={t(locale, "flights.searchPlaceholder")}
          locale={locale}
          value={origin}
          onChange={setOrigin}
        />
        <AirportPicker
          label={t(locale, "flights.destinationAirport")}
          placeholder={t(locale, "flights.searchPlaceholder")}
          locale={locale}
          value={dest}
          onChange={setDest}
        />
      </div>

      {distanceKm !== null ? (
        <p className="rounded-md bg-navy-50 px-3 py-2 text-xs text-navy-600">
          {t(locale, "flights.distanceNote")}: <strong>≈ {distanceKm.toLocaleString()} km</strong>
          <span className="block text-navy-400">
            {locale === "bn"
              ? "সরলরেখার দূরত্ব — প্রকৃত ফ্লাইট পথ সাধারণত দীর্ঘ হয়। এই দূরত্ব থেকে ভাড়া অনুমান করা হয় না।"
              : "Straight-line distance — the actual flight path is usually longer. No fare is estimated from this."}
          </span>
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <span className="mb-1 block text-sm font-medium text-navy-700">{t(locale, "flights.tripType")}</span>
          <div className="flex gap-2">
            {(["one_way", "return"] as const).map((tt) => (
              <button
                key={tt}
                type="button"
                onClick={() => setTripType(tt)}
                aria-pressed={tripType === tt}
                className={`rounded-md border px-3 py-2 text-sm ${
                  tripType === tt
                    ? "border-[var(--brand-primary)] bg-navy-50 font-medium"
                    : "border-navy-200 bg-white"
                }`}
              >
                {t(locale, tt === "one_way" ? "flights.oneWay" : "flights.roundTrip")}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="depart">
            {t(locale, "flights.departDate")}
          </label>
          <input
            id="depart"
            type="date"
            required
            min={new Date().toISOString().slice(0, 10)}
            value={departDate}
            onChange={(e) => setDepartDate(e.target.value)}
            className={inputCls}
          />
        </div>
        {tripType === "return" ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="ret">
              {t(locale, "flights.returnDate")}
            </label>
            <input
              id="ret"
              type="date"
              min={departDate || new Date().toISOString().slice(0, 10)}
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              className={inputCls}
            />
          </div>
        ) : null}
        <div>
          <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="pax">
            {t(locale, "flights.passengers")}
          </label>
          <select
            id="pax"
            value={passengers}
            onChange={(e) => setPassengers(Number(e.target.value))}
            className={inputCls}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="cabin">
            {t(locale, "flights.cabin")}
          </label>
          <select id="cabin" value={cabin} onChange={(e) => setCabin(e.target.value)} className={inputCls}>
            {["economy", "premium_economy", "business", "first"].map((c) => (
              <option key={c} value={c}>{t(locale, `flights.cabin.${c}` as never)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="phone">
            {t(locale, "flights.contactPhone")} <span className="text-red-600">*</span>
          </label>
          <input
            id="phone"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputCls}
            placeholder="+880 1XXX XXXXXX"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="wa">
            {t(locale, "flights.contactWhatsapp")}
          </label>
          <input id="wa" type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="imo">
            {t(locale, "flights.contactImo")}
          </label>
          <input id="imo" type="text" value={imo} onChange={(e) => setImo(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="notes">
          {t(locale, "flights.notes")}
        </label>
        <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
      </div>

      {!providerConfigured ? (
        <p className="rounded-md border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-gold-900">
          {t(locale, "flights.providerUnavailable")}
        </p>
      ) : null}

      {fee ? (
        <p className="rounded-md border border-navy-100 bg-white px-3 py-2 text-sm">
          {t(locale, "flights.feeLine")}:{" "}
          <strong>
            {fee.amount === 0
              ? locale === "bn" ? "সহায়তা ফি প্রযোজ্য নয়" : "No assistance fee at this time"
              : `${fee.amount} ${fee.currency}`}
          </strong>
        </p>
      ) : null}

      <label className="flex items-start gap-2 text-sm text-navy-700">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1"
        />
        <span>
          {t(locale, "flights.terms")}{" "}
          <Link href="/terms" className="underline">{t(locale, "footer.terms")}</Link>
        </span>
      </label>

      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? t(locale, "flights.submitting") : t(locale, "flights.submit")}
      </button>
    </form>
  );
}
