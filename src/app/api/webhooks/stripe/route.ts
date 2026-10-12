import { NextResponse } from "next/server";
import { configStatus } from "@/lib/payments";
import { recordConfirmedPayment } from "@/lib/payments";

/**
 * Stripe webhook. Without configured credentials the endpoint reports 503 —
 * it never simulates success. With credentials, the raw body is verified
 * against the Stripe-Signature header before anything is recorded.
 */
export async function POST(request: Request) {
  if (!configStatus().configured) {
    return NextResponse.json(
      { error: "payments_provider_not_configured" },
      { status: 503 },
    );
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  const secret = process.env.STRIPE_WEBHOOK_SECRET as string;

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    const { verifyStripeSignature } = await import("@/lib/payments");
    if (!verifyStripeSignature(payload, signature, secret)) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const metadata = (session.metadata ?? {}) as Record<string, string>;
    const applicationId = metadata["application_id"];
    if (!applicationId) {
      return NextResponse.json({ error: "missing_metadata" }, { status: 400 });
    }
    // Amounts are re-read from the provider payload, never from the client.
    const amountTotal = Number(session.amount_total ?? 0) / 100;
    const currency = String(session.currency ?? "usd").toUpperCase();
    await recordConfirmedPayment({
      providerRef: String(session.id),
      applicationId,
      amount: amountTotal,
      currency,
      idempotencyKey: `stripe:${String(session.id)}`,
    });
  }

  return NextResponse.json({ received: true });
}
