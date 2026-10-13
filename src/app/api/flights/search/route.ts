import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { searchFlightOffers, validateFlightSearchParams } from "@/lib/flights";

/**
 * Live flight-offer search. Authenticated customers and staff only (the
 * provider charges per search — anonymous scraping would exhaust the quota).
 * Rate-limited per user. Results are provider data passed through verbatim;
 * no fare, schedule, or availability is ever synthesized here.
 */
const CABINS = new Set(["economy", "premium_economy", "business", "first"]);

export async function POST(request: Request) {
  const user = await getSessionUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!checkRateLimit(`flights-search:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const originIata = String(body.originIata ?? "").trim().toUpperCase();
  const destinationIata = String(body.destinationIata ?? "").trim().toUpperCase();
  const date = String(body.departDate ?? "").trim();
  const returnDateRaw = body.returnDate == null ? null : String(body.returnDate).trim();
  const tripType = body.tripType === "return" ? "return" : "one_way";
  const passengers = Number(body.passengers ?? 1);
  const cabinRaw = String(body.cabinClass ?? "economy");
  const cabinClass = (CABINS.has(cabinRaw) ? cabinRaw : "economy") as
    | "economy"
    | "premium_economy"
    | "business"
    | "first";

  // ---- Validation BEFORE any provider call (shared pure validator) --------
  const invalid =
    validateFlightSearchParams({
      originIata,
      destinationIata,
      date,
      returnDate: tripType === "return" ? returnDateRaw : null,
    }) ?? (!Number.isInteger(passengers) || passengers < 1 || passengers > 9 ? "invalid_params" : null);
  if (invalid) {
    return NextResponse.json(
      {
        available: false,
        reason: invalid,
        quotes: [],
        retrievedAt: new Date().toISOString(),
      },
      { status: 200 },
    );
  }

  const result = await searchFlightOffers({
    originIata,
    destinationIata,
    date,
    returnDate: tripType === "return" ? returnDateRaw : null,
    adults: passengers,
    cabinClass,
    currency: "USD",
    max: 6,
  });
  return NextResponse.json(result, { status: 200 });
}
