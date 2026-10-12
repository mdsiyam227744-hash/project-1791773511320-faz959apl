import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  configStatus,
  verifyStripeSignature,
  recordPaymentEvent,
  recordConfirmedTransaction,
} from "@/lib/payments";
import { verifyOrderPaymentIntegrity, markOrderPaymentVerified } from "@/lib/orders";

/**
 * Stripe webhook — the only path that can mark a payment (and its order)
 * confirmed.
 *
 * Order of operations (each step fails closed):
 *   1. Refuse to process anything unless the provider is fully configured.
 *   2. Verify the Stripe-Signature HMAC over the raw body — forged requests
 *      are rejected before parsing.
 *   3. Log the event id in an append-only table; replays return early here —
 *      this is the idempotency boundary.
 *   4. Re-read the amount from the provider payload and compare it with the
 *      order's immutable price snapshot (price integrity) before confirming.
 *   5. Confirm the payment row, then move the order to payment_verified via
 *      the guarded transition (service context, so the database guard accepts
 *      it and a browser session could not).
 */
export async function POST(request: Request) {
  if (!configStatus().configured) {
    return NextResponse.json({ error: "payments_provider_not_configured" }, { status: 503 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  const secret = process.env.STRIPE_WEBHOOK_SECRET as string;

  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    if (!verifyStripeSignature(payload, signature, secret)) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const payloadDigest = createHash("sha256").update(payload).digest("hex");

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const metadata = (session.metadata ?? {}) as Record<string, string>;
    const orderId = metadata["order_id"];
    const applicationId = metadata["application_id"];

    if (!orderId && !applicationId) {
      return NextResponse.json({ error: "missing_metadata" }, { status: 400 });
    }

    // Idempotency gate: only the first delivery of an event id is processed.
    let firstDelivery: "inserted" | "duplicate";
    try {
      firstDelivery = await recordPaymentEvent({
        provider: "stripe",
        providerEventId: event.id,
        eventType: event.type,
        orderReference: orderId ?? applicationId ?? null,
        payloadDigest,
      });
    } catch {
      return NextResponse.json({ error: "event_log_failed" }, { status: 500 });
    }
    if (firstDelivery === "duplicate") {
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Amounts are re-read from the provider payload, never from the client.
    const amountTotal = Number(session.amount_total ?? 0) / 100;
    const currency = String(session.currency ?? "usd").toUpperCase();

    try {
      if (orderId) {
        // Price integrity first: the webhook amount must match the snapshot.
        await verifyOrderPaymentIntegrity(orderId, amountTotal, currency);
      }
      await recordConfirmedTransaction({
        providerRef: String(session.id),
        applicationId: applicationId ?? undefined,
        orderId: orderId ?? undefined,
        amount: amountTotal,
        currency,
        idempotencyKey: `stripe:${String(session.id)}`,
      });
      if (orderId) {
        await markOrderPaymentVerified(orderId);
      }
    } catch (err) {
      // Integrity mismatch or storage failure: tell the provider to retry
      // later rather than acknowledging a payment we could not verify.
      const message = err instanceof Error ? err.message : "unknown";
      if (message.startsWith("payment_amount_mismatch")) {
        return NextResponse.json({ error: "amount_mismatch" }, { status: 400 });
      }
      return NextResponse.json({ error: "confirm_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
