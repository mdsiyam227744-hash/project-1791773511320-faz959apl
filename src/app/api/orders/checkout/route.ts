import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { initiateOrderCheckout } from "@/lib/orders";

/**
 * Starts (or resumes) checkout for an existing service order. The amount is
 * re-read from the order's immutable price snapshot server-side — the browser
 * supplies only the order id.
 */
export async function POST(request: Request) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!checkRateLimit(`checkout:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { orderId?: string } | null;
  if (!body?.orderId) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const origin = new URL(request.url).origin;
  const result = await initiateOrderCheckout(body.orderId, user.id, origin);

  if (!result.available) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  if ("free" in result && result.free) {
    return NextResponse.json({ free: true });
  }
  if ("url" in result && result.url) {
    return NextResponse.json({ url: result.url });
  }
  return NextResponse.json({ error: "payments_provider_error" }, { status: 400 });
}
