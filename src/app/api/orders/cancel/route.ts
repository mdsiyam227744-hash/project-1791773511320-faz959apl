import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const bodySchema = z.object({ orderId: z.string().uuid() });

/**
 * Customer-initiated cancellation. Allowed only while the order is unpaid
 * (pending_payment); the database transition guard enforces the same rule
 * independently. Authenticated as the owner — RLS is the second boundary.
 */
export async function POST(request: Request) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!checkRateLimit(`orders:cancel:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from("service_orders")
    .update({ status: "cancelled" })
    .eq("id", parsed.data.orderId)
    .eq("customer_id", user.id)
    .eq("status", "pending_payment")
    .select("id")
    .maybeSingle();

  if (error || data === null) {
    return NextResponse.json({ error: "not_cancellable" }, { status: 400 });
  }
  return NextResponse.json({ cancelled: true });
}
