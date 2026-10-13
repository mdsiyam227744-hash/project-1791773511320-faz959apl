"use client";

/**
 * Live flight search + booking-assistance request, sharing one airport state.
 *
 * - Live search calls /api/flights/search (authenticated, rate-limited) which
 *   queries the configured provider. When the provider is not configured the
 *   search button is disabled and the honest notice explains exactly what is
 *   missing — no fabricated results, ever.
 * - Every search failure reason gets a specific, bilingual message: invalid
 *   route, invalid dates, provider auth failure, provider error, or quota.
 * - Selecting a result hands the real quote to the assistance-request form;
 *   the order stores the provider quote summary verbatim for staff review.
 */
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";
import { haversineKm } from "@/lib/geo";
import { AirportPicker, type AirportSuggestion } from "./airport-picker";

interface Quote {
  airline: string;
  price: number;
  currency: string;
  stops: number;
}

interface SearchResponse {
  available: boolean;
  reason?: string;
  quotes: Quote[];
  retrievedAt: string;
}

const CABINS = ["economy", "premium_economy", "business", "first"] as const;

export function FlightSearchPanel({
  locale,
  fee,
  providerConfigured,
}: {
  locale: Locale;
  fee: { amount: number; currency: string; labelEn: string; labelBn: string } | null;
  providerConfigured: boolean;
}) {
  const router = useRouter();
  const requestRef = useRef<HTMLDivElement>(null);

  // --- search state ---
  const [origin, setOrigin] = useState<AirportSuggestion | null>(null);
  const [dest, setDest] = useState<AirportSuggestion | null>(null);
  const [tripType, setTripType] = useState<"one_way" | "return">("one_way");
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [cabin, setCabin] = useState<(typeof CABINS)[number]>("economy");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);

  // --- request state ---
  const [showRequest, setShowRequest] = useState(false);
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [imo, setImo] = useState("");
  const [notes, setNotes] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const bn = locale === "bn";

  function reasonToMessage(reason: string | undefined): string {
    switch (reason) {
      case "invalid_route":
        return bn
          ? "একই বিমানবন্দর থেকে একই বিমানবন্দরে সার্চ করা যায় না — ভিন্ন গন্তব্য নির্বাচন করুন।"
          : "Origin and destination are the same airport — choose a different destination.";
      case "invalid_params":
        return bn
          ? "ফর্মে কিছু তথ্য অনুপস্থিত বা ভুল — তারিখ ও বিমানবন্দর যাচাই করুন।"
          : "Some search details are missing or invalid — check the airports and dates.";
      case "flights_provider_auth_failed":
        return bn
          ? "ফ্লাইট সরবরাহকারীর সঙ্গে সংযোগে প্রমাণীকরণ ব্যর্থ হয়েছে। আমাদের টিমকে জানান।"
          : "Flight provider authentication failed. Please contact our team.";
      case "flights_rate_limited":
        return bn
          ? "সার্চের সীমা শেষ — কিছুক্ষণ পর আবার চেষ্টা করুন।"
          : "Search limit reached — please try again shortly.";
      case "flights_provider_error":
        return bn
          ? "ফ্লাইট সরবরাহকারী এখন সমস্যায় আছে। কিছুক্ষণ পর আবার চেষ্টা করুন।"
          : "The flight provider is having trouble right now. Please try again shortly.";
      case "flights_provider_not_configured":
        return bn
          ? "সরাসরি ভাড়া অনুসন্ধান এখনো সংযুক্ত হয়নি। নিচের ফর্মে অনুরোধ পাঠান।"
          : "Live fare search is not connected yet. Please submit the request form below.";
      case "rate_limited":
        return bn
          ? "অনেক বেশি সার্চ — এক মিনিট পর চেষ্টা করুন।"
          : "Too many searches — try again in a minute.";
      case "unauthenticated":
        return bn ? "সার্চ করতে লগ ইন করুন।" : "Please log in to search live fares.";
      default:
        return bn
          ? "সার্চ করা যায়নি। আবার চেষ্টা করুন।"
          : "The search could not be completed. Please try again.";
    }
  }

  function validateSearch(): string | null {
    if (!origin || !dest) {
      return bn ? "দুটি বিমানবন্দরই নির্বাচন করুন।" : "Please select both airports.";
    }
    if (!departDate) {
      return bn ? "যাত্রার তারিখ দিন।" : "Please choose a departure date.";
    }
    if (tripType === "return" && !returnDate) {
      return bn ? "ফেরার তারিখ দিন।" : "Please choose a return date.";
    }
    if (tripType === "return" && returnDate && returnDate < departDate) {
      return bn ? "ফেরার তারিখ যাত্রার তারিখের আগে হতে পারে না।" : "Return date cannot be before departure.";
    }
    if (origin.id === dest.id || origin.iata_code === dest.iata_code) {
      return bn ? "একই বিমানবন্দর দুই প্রান্তে নির্বাচন করা হয়েছে।" : "The same airport is selected for both ends.";
    }
    return null;
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchError(null);
    setResults(null);
    setSelectedQuote(null);
    setShowRequest(false);
    const local = validateSearch();
    if (local) {
      setSearchError(local);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch("/api/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originIata: origin!.iata_code ?? "",
          destinationIata: dest!.iata_code ?? "",
          departDate,
          returnDate: tripType === "return" ? returnDate : null,
          tripType,
          passengers,
          cabinClass: cabin,
        }),
      });
      const json = (await res.json()) as SearchResponse & { error?: string };
      if (!res.ok) {
        setSearchError(reasonToMessage(json.error));
        return;
      }
      setResults(json);
      if (!json.available) setSearchError(reasonToMessage(json.reason));
    } catch {
      setSearchError(bn ? "নেটওয়ার্ক সমস্যা। আবার চেষ্টা করুন।" : "Network problem. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  function proceedToRequest(q: Quote | null) {
    setSelectedQuote(q);
    setShowRequest(true);
    requestRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const distanceKm =
    origin && dest
      ? Math.round(haversineKm(origin.latitude, origin.longitude, dest.latitude, dest.longitude))
      : null;

  const inputCls =
    "w-full rounded-md border border-navy-200 px-3 py-2 text-base focus:border-[var(--brand-primary)] focus:outline-none";

  return (
    <div className="space-y-8">
      {/* -------- Search -------- */}
      <form onSubmit={runSearch} className="space-y-5" aria-label={t(locale, "flights.searchTitle")}>
        <fieldset disabled={!providerConfigured} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <AirportPicker
              label={t(locale, "flights.originAirport")}
              placeholder={t(locale, "flights.searchPlaceholder")}
              locale={locale}
              value={origin}
              onChange={setOrigin}
              inputId="fs-origin"
            />
            <AirportPicker
              label={t(locale, "flights.destinationAirport")}
              placeholder={t(locale, "flights.searchPlaceholder")}
              locale={locale}
              value={dest}
              onChange={setDest}
              inputId="fs-dest"
            />
          </div>

          {distanceKm !== null ? (
            <p className="rounded-md bg-navy-50 px-3 py-2 text-sm text-navy-600">
              {t(locale, "flights.distanceNote")}: <strong>≈ {distanceKm.toLocaleString()} km</strong>
              <span className="block text-sm text-navy-500">
                {bn
                  ? "সরলরেখার দূরত্ব — প্রকৃত ফ্লাইট পথ সাধারণত দীর্ঘ হয়। এই দূরত্ব থেকে ভাড়া অনুমান করা হয় না।"
                  : "Straight-line distance — the actual flight path is usually longer. No fare is estimated from this."}
              </span>
            </p>
          ) : null}

          <div className="grid gap-4 md:grid-cols-5">
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
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="fs-depart">
                {t(locale, "flights.departDate")}
              </label>
              <input
                id="fs-depart"
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
                <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="fs-ret">
                  {t(locale, "flights.returnDate")}
                </label>
                <input
                  id="fs-ret"
                  type="date"
                  min={departDate || new Date().toISOString().slice(0, 10)}
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className={inputCls}
                />
              </div>
            ) : null}
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="fs-pax">
                {t(locale, "flights.passengers")}
              </label>
              <select
                id="fs-pax"
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
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="fs-cabin">
                {t(locale, "flights.cabin")}
              </label>
              <select
                id="fs-cabin"
                value={cabin}
                onChange={(e) => setCabin(e.target.value as (typeof CABINS)[number])}
                className={inputCls}
              >
                {CABINS.map((c) => (
                  <option key={c} value={c}>{t(locale, `flights.cabin.${c}` as never)}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={searching}
            className="rounded-md bg-[var(--brand-primary)] px-5 py-3 text-base font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {searching ? t(locale, "flights.searching") : t(locale, "flights.searchButton")}
          </button>
        </fieldset>

        {searching ? (
          <p role="status" className="rounded-md bg-navy-50 px-3 py-2 text-sm text-navy-700">
            {t(locale, "common.loading")}
          </p>
        ) : null}
        {searchError ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {searchError}
          </p>
        ) : null}

        {/* -------- Results -------- */}
        {results?.available && results.quotes.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">{t(locale, "flights.resultsTitle")}</h3>
            <p className="text-sm text-navy-500">{t(locale, "flights.resultsNote")}</p>
            <ul className="space-y-3">
              {results.quotes.map((q, i) => (
                <li
                  key={`${q.airline}-${q.price}-${i}`}
                  className="flex flex-col gap-3 rounded-xl border border-navy-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="text-sm">
                    <p className="font-semibold text-navy-900">
                      {q.airline} · {q.stops === 0 ? t(locale, "flights.direct") : `${q.stops} ${t(locale, "flights.stops")}`}
                    </p>
                    <p className="mt-1 text-navy-600">
                      {origin!.iata_code} → {dest!.iata_code} · {departDate}
                      {tripType === "return" ? ` · ${returnDate}` : ""} · {passengers} × {t(locale, `flights.cabin.${cabin}` as never)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <p className="text-lg font-bold text-navy-900">
                      {q.price > 0 ? `${q.price} ${q.currency}` : t(locale, "flights.priceUnavailable")}
                    </p>
                    <button
                      type="button"
                      onClick={() => proceedToRequest(q)}
                      className="rounded-md border border-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--brand-primary)] hover:bg-navy-50"
                    >
                      {t(locale, "flights.selectOffer")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {results?.available && results.quotes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-navy-200 bg-navy-50/60 p-5">
            <p className="text-base leading-relaxed text-navy-700">{t(locale, "flights.noResults")}</p>
            <p className="mt-1 text-sm text-navy-500">{t(locale, "flights.noResultsHint")}</p>
          </div>
        ) : null}
      </form>

      {/* -------- Honest unconfigured notice -------- */}
      {!providerConfigured ? (
        <p className="rounded-md border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-gold-900">
          {t(locale, "flights.providerUnavailable")}
        </p>
      ) : null}

      {/* -------- Assistance request -------- */}
      <div ref={requestRef}>
        <form onSubmit={onSubmitRequest} className="space-y-5" aria-label={t(locale, "flights.requestTitle")}>
          {selectedQuote ? (
            <p className="rounded-md border border-navy-100 bg-white px-3 py-2 text-sm">
              {t(locale, "flights.selectedOffer")}:{" "}
              <strong>
                {selectedQuote.airline} ·{" "}
                {selectedQuote.price > 0
                  ? `${selectedQuote.price} ${selectedQuote.currency}`
                  : t(locale, "flights.priceUnavailable")}
              </strong>
              <span className="mt-1 block text-navy-500">{t(locale, "flights.selectedOfferNote")}</span>
            </p>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="fr-phone">
                {t(locale, "flights.contactPhone")} <span className="text-red-600">*</span>
              </label>
              <input
                id="fr-phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputCls}
                placeholder="+880 1XXX XXXXXX"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="fr-wa">
                {t(locale, "flights.contactWhatsapp")}
              </label>
              <input
                id="fr-wa"
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="fr-imo">
                {t(locale, "flights.contactImo")}
              </label>
              <input
                id="fr-imo"
                type="text"
                value={imo}
                onChange={(e) => setImo(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="fr-notes">
              {t(locale, "flights.notes")}
            </label>
            <textarea id="fr-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
          </div>

          {fee ? (
            <p className="rounded-md border border-navy-100 bg-white px-3 py-2 text-sm">
              {t(locale, "flights.feeLine")}:{" "}
              <strong>
                {fee.amount === 0
                  ? bn ? "সহায়তা ফি প্রযোজ্য নয়" : "No assistance fee at this time"
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

          {submitError ? (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-[var(--brand-primary)] px-5 py-3 text-base font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? t(locale, "flights.submitting") : t(locale, "flights.submit")}
          </button>
        </form>
      </div>
    </div>
  );

  async function onSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!origin || !dest) {
      setSubmitError(bn ? "দুটি বিমানবন্দরই নির্বাচন করুন।" : "Please select both airports.");
      return;
    }
    if (!departDate) {
      setSubmitError(bn ? "যাত্রার তারিখ দিন।" : "Please choose a departure date.");
      return;
    }
    if (!accepted) {
      setSubmitError(bn ? "শর্তাবলি স্বীকার করুন।" : "Please accept the service terms.");
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
          selectedQuote: selectedQuote ?? null,
        }),
      });
      const json = (await res.json()) as { orderId?: string; error?: string };
      if (!res.ok || !json.orderId) {
        setSubmitError(
          json.error === "rate_limited"
            ? bn ? "অনেক বেশি অনুরোধ। এক মিনিট পর চেষ্টা করুন।" : "Too many requests. Try again in a minute."
            : bn ? "অনুরোধ পাঠানো যায়নি। আবার চেষ্টা করুন।" : "Could not submit the request. Please try again.",
        );
        return;
      }
      router.push(`/account/orders/${json.orderId}`);
    } catch {
      setSubmitError(bn ? "নেটওয়ার্ক সমস্যা। আবার চেষ্টা করুন।" : "Network problem. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }
}

