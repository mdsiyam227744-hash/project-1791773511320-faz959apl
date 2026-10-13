import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createFlightAssistanceOrder } from "@/lib/orders";

const quoteSchema = z.object({
  airline: z.string().trim().min(1).max(80),
  price: z.number().nonnegative(),
  currency: z.string().trim().length(3),
  stops: z.number().int().min(0).max(9),
});

const bodySchema = z.object({
  originAirportId: z.string().uuid(),
  destinationAirportId: z.string().uuid(),
  originCountry: z.string().trim().length(2),
  destinationCountry: z.string().trim().length(2),
  departDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  tripType: z.enum(["one_way", "return"]),
  passengers: z.number().int().min(1).max(9),
  cabinClass: z.enum(["economy", "premium_economy", "business", "first"]),
  contactPhone: z.string().trim().min(6).max(24),
  contactWhatsapp: z.string().trim().max(24).optional().nullable(),
  contactImo: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  selectedQuote: quoteSchema.nullable().optional(),
});

export async function POST(request: Request) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!checkRateLimit(`orders:create:${user.id}`, 5, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const result = await createFlightAssistanceOrder(user.id, {
    serviceKey: "flight_ticketing",
    serviceLabel: "Flight booking assistance",
    trip: {
      originAirportId: parsed.data.originAirportId,
      destinationAirportId: parsed.data.destinationAirportId,
      originCountry: parsed.data.originCountry,
      destinationCountry: parsed.data.destinationCountry,
      departDate: parsed.data.departDate,
      returnDate: parsed.data.returnDate ?? null,
      tripType: parsed.data.tripType,
      passengers: parsed.data.passengers,
      cabinClass: parsed.data.cabinClass,
      contactPhone: parsed.data.contactPhone,
      contactWhatsapp: parsed.data.contactWhatsapp ?? null,
      contactImo: parsed.data.contactImo ?? null,
      notes: parsed.data.notes ?? null,
      selectedQuote: parsed.data.selectedQuote ?? null,
    },
  });

  if (!result.available) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({
    orderId: result.orderId,
    reference: result.reference,
    total: result.total,
    currency: result.currency,
  });
}
