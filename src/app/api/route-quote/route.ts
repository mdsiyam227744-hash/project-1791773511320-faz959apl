import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import { listCountries } from "@/lib/catalog";
import { haversineKm, searchFlightOffers, configStatus } from "@/lib/flights";
import { estimateApplicationCost } from "@/lib/fees";

/**
 * Origin→destination route estimator.
 *  - Distance: great-circle between city coordinates (labelled as approximate;
 *    never presented as actual flown distance).
 *  - Fares: live provider quotes only. When the provider is not configured the
 *    response says so and the UI shows "request a quote".
 *  - Total: produced only when the official visa fee record is verified.
 */
// Small built-in coordinate table for the planner (city-level). Keeping this
// server-side avoids a map-provider dependency for the distance feature; the
// admin can extend it via the service_fees-style config later.
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  dhaka: { lat: 23.8103, lon: 90.4125 },
  chattogram: { lat: 22.3569, lon: 91.7832 },
  kolkata: { lat: 22.5726, lon: 88.3639 },
  delhi: { lat: 28.6139, lon: 77.209 },
  mumbai: { lat: 19.076, lon: 72.8777 },
  kathmandu: { lat: 27.7172, lon: 85.324 },
  colombo: { lat: 6.9271, lon: 79.8612 },
  bangkok: { lat: 13.7563, lon: 100.5018 },
  kuala_lumpur: { lat: 3.139, lon: 101.6869 },
  singapore: { lat: 1.3521, lon: 103.8198 },
  dubai: { lat: 25.2048, lon: 55.2708 },
  doha: { lat: 25.2854, lon: 51.531 },
  riyadh: { lat: 24.7136, lon: 46.6753 },
  jeddah: { lat: 21.4858, lon: 39.1925 },
  london: { lat: 51.5074, lon: -0.1278 },
  manchester: { lat: 53.4808, lon: -2.2426 },
  paris: { lat: 48.8566, lon: 2.3522 },
  frankfurt: { lat: 50.1109, lon: 8.6821 },
  rome: { lat: 41.9028, lon: 12.4964 },
  madrid: { lat: 40.4168, lon: -3.7038 },
  istanbul: { lat: 41.0082, lon: 28.9784 },
  new_york: { lat: 40.7128, lon: -74.006 },
  toronto: { lat: 43.6532, lon: -79.3832 },
  sydney: { lat: -33.8688, lon: 151.2093 },
  kuala: { lat: 3.139, lon: 101.6869 },
  tokyo: { lat: 35.6762, lon: 139.6503 },
  seoul: { lat: 37.5665, lon: 126.978 },
  beijing: { lat: 39.9042, lon: 116.4074 },
  kuala_selangor: { lat: 3.35, lon: 101.25 },
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { origin_country, destination_country, origin_city, destination_city, travel_date } =
    body as Record<string, string | null>;

  if (!origin_country || !destination_country) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // Resolve countries
  const countries = await listCountries();
  const originCountry = countries.find((c) => c.iso2 === origin_country.toUpperCase());
  const destCountry = countries.find((c) => c.iso2 === destination_country.toUpperCase());
  if (!originCountry || !destCountry) {
    return NextResponse.json({ error: "unknown_country" }, { status: 400 });
  }

  // Distance between known city coordinates (great-circle, clearly labelled)
  let distanceKm: number | null = null;
  const oc = (origin_city ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  const dc = (destination_city ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  const from = CITY_COORDS[oc];
  const to = CITY_COORDS[dc];
  if (from && to) {
    distanceKm = haversineKm(from.lat, from.lon, to.lat, to.lon);
  }

  // Live fares — only from the real provider
  const fare = await searchFlightOffers({
    originIata: CITY_COORDS_IATA[oc] ?? "",
    destinationIata: CITY_COORDS_IATA[dc] ?? "",
    date: travel_date ?? new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    adults: 1,
    currency: "USD",
    max: 5,
  });

  // Visa fees: cheapest verified published listing for this corridor, if any
  const supabase = createClient();
  const { data: listing } = await supabase
    .from("visa_listings")
    .select("id, fee_currency")
    .eq("destination_country_id", destCountry.id)
    .eq("origin_country_id", originCountry.id)
    .eq("status", "published")
    .limit(1)
    .maybeSingle();

  let fees: { label: string; amount: number | null; currency: string | null; verified: boolean }[] = [];
  let officialAmount: number | null = null;
  let officialVerified = false;
  let officialCurrency: string | null = null;

  if (listing) {
    const { data: feeRows } = await supabase
      .from("visa_fees")
      .select("label_en, amount, currency, is_verified, kind")
      .eq("visa_listing_id", listing.id);
    fees = (feeRows ?? []).map((f) => ({
      label: f.label_en,
      amount: f.amount,
      currency: f.currency,
      verified: f.is_verified,
    }));
    const official = (feeRows ?? []).find((f) => f.kind === "official_government");
    if (official) {
      officialAmount = official.amount;
      officialVerified = official.is_verified;
      officialCurrency = official.currency;
    }
  }

  // Agency service fee (business-controlled, from settings table)
  const { data: svcFee } = await supabase
    .from("service_fees")
    .select("label_en, amount, currency")
    .eq("key", "visa_assistance")
    .eq("active", true)
    .maybeSingle();

  const estimate = estimateApplicationCost({
    officialFeeAmount: officialAmount,
    officialFeeVerified: officialVerified,
    officialFeeCurrency: officialCurrency,
    serviceFeeAmount: svcFee?.amount ?? null,
  });

  // Persist the query (owner-scoped when logged in)
  const user = await getSessionUser().catch(() => null);
  if (user && isSupabaseConfigured()) {
    await supabase.from("route_queries").insert({
      user_id: user.id,
      origin_country_id: originCountry.id,
      origin_city: origin_city ?? null,
      destination_country_id: destCountry.id,
      destination_city: destination_city ?? null,
      travel_date: travel_date ?? null,
      distance_km: distanceKm,
      distance_source: "great_circle_city_coords",
    }).then(() => {}, () => {});
  }

  return NextResponse.json({
    distanceKm,
    distanceSource: "great_circle_city_coords",
    fare: {
      available: fare.available,
      reason: fare.reason,
      quotes: fare.quotes,
      retrievedAt: fare.retrievedAt,
    },
    fees,
    serviceFee: svcFee
      ? { label: svcFee.label_en, amount: svcFee.amount, currency: svcFee.currency }
      : null,
    total: estimate.total,
    note: estimate.note,
  });
}

// IATA codes for the fare provider (city slug → IATA)
const CITY_COORDS_IATA: Record<string, string> = {
  dhaka: "DAC",
  chattogram: "CGP",
  kolkata: "CCU",
  delhi: "DEL",
  mumbai: "BOM",
  kathmandu: "KTM",
  colombo: "CMB",
  bangkok: "BKK",
  kuala_lumpur: "KUL",
  singapore: "SIN",
  dubai: "DXB",
  doha: "DOH",
  riyadh: "RUH",
  jeddah: "JED",
  london: "LHR",
  manchester: "MAN",
  paris: "CDG",
  frankfurt: "FRA",
  rome: "FCO",
  madrid: "MAD",
  istanbul: "IST",
  new_york: "JFK",
  toronto: "YYZ",
  sydney: "SYD",
  tokyo: "NRT",
  seoul: "ICN",
  beijing: "PEK",
};
