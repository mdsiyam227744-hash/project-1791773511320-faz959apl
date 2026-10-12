import { createServiceClient, isServiceConfigured } from "./supabase/server";

// Shared, dependency-free pieces (pure functions used by the webhook route and tests).
export { verifyStripeSignature } from "./webhook-signature";

/**
 * Payments integration boundary (Stripe Checkout).
 *
 * Until STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are configured, every paid
 * feature reports { available: false, reason: "payments_provider_not_configured" }
 * and the webhook endpoint returns 503. Nothing is ever marked paid because a
 * customer landed on a success URL — confirmation comes only from a verified
 * webhook event, recorded idempotently.
 *
 * This module never imports order logic: order state, price snapshots, and
 * integrity checks live in orders.ts. The webhook route composes the two.
 */

export interface PaymentsConfigStatus {
  configured: boolean;
}

export function configStatus(): PaymentsConfigStatus {
  return {
    configured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
  };
}

export interface CheckoutResult {
  available: boolean;
  reason?: string;
  url?: string;
  sessionId?: string;
}

export interface CreateCheckoutArgs {
  // Either an existing visa-assistance application…
  applicationId?: string;
  // …or a service order (the flight-assistance path)
  orderId?: string;
  serviceFeeKey: string;
  amount: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}

export async function createCheckoutForServiceFee(opts: CreateCheckoutArgs): Promise<CheckoutResult> {
  if (!configStatus().configured) {
    return { available: false, reason: "payments_provider_not_configured" };
  }
  const secret = process.env.STRIPE_SECRET_KEY as string;
  const productName = opts.orderId
    ? `Service order — ${opts.serviceFeeKey}`
    : `Service fee — ${opts.serviceFeeKey}`;
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": opts.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(Math.round(opts.amount * 100)),
    "line_items[0][price_data][product_data][name]": productName,
    "line_items[0][quantity]": "1",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  });
  if (opts.applicationId) {
    body.set("metadata[application_id]", opts.applicationId);
  }
  if (opts.orderId) {
    body.set("metadata[order_id]", opts.orderId);
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": opts.idempotencyKey,
    },
    body,
  });
  if (!res.ok) {
    return { available: false, reason: "payments_provider_error" };
  }
  const json = (await res.json()) as { id: string; url: string };

  await recordTransaction({
    applicationId: opts.applicationId ?? null,
    orderId: opts.orderId ?? null,
    customerId: null,
    amount: opts.amount,
    currency: opts.currency.toUpperCase(),
    provider: "stripe",
    providerRef: json.id,
    idempotencyKey: opts.idempotencyKey,
  });
  return { available: true, url: json.url, sessionId: json.id };
}

export interface RecordTxArgs {
  applicationId: string | null;
  orderId: string | null;
  customerId: string | null;
  amount: number;
  currency: string;
  provider: string;
  providerRef: string | null;
  idempotencyKey: string;
}

/**
 * Append-only provider event log: one row per unique provider event id.
 * Returns "inserted" only for the first delivery — replays are no-ops, which
 * is what makes webhook processing idempotent at the storage layer.
 */
export async function recordPaymentEvent(args: {
  provider: string;
  providerEventId: string;
  eventType: string;
  orderReference: string | null;
  payloadDigest: string;
}): Promise<"inserted" | "duplicate"> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("payment_event_log").insert({
    provider: args.provider,
    provider_event_id: args.providerEventId,
    event_type: args.eventType,
    order_reference: args.orderReference,
    payload_digest: args.payloadDigest,
  });
  if (!error) return "inserted";
  if (error.code === "23505") return "duplicate"; // unique violation
  throw new Error(`payment_event_log_failed: ${error.message}`);
}

export async function recordTransaction(args: RecordTxArgs) {
  const supabase = createServiceClient();
  // Resolve the owning customer for order payments so the owner-visibility
  // policy in 0002 applies to them too.
  let customerId: string | null = args.customerId;
  if (!customerId && args.orderId) {
    const { data: owner } = await supabase
      .from("service_orders")
      .select("customer_id")
      .eq("id", args.orderId)
      .maybeSingle();
    customerId = (owner as unknown as { customer_id: string } | null)?.customer_id ?? null;
  }
  const { data, error } = await supabase
    .from("payment_transactions")
    .upsert(
      {
        application_id: args.applicationId,
        order_id: args.orderId,
        customer_id: customerId,
        amount: args.amount,
        currency: args.currency,
        status: "requires_confirmation",
        provider: args.provider,
        provider_ref: args.providerRef,
        idempotency_key: args.idempotencyKey,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`payment_record_failed: ${error.message}`);
  return data;
}

/**
 * Records the confirmed payment row (provider evidence). Called ONLY from the
 * webhook after signature verification and event deduplication. Idempotent:
 * replaying the same checkout session cannot double-confirm.
 * Order-status transitions and snapshot integrity are the caller's concern
 * (orders.ts / webhook route) so this module stays free of order logic.
 */
export async function recordConfirmedTransaction(args: {
  providerRef: string;
  applicationId?: string;
  orderId?: string;
  customerId?: string | null;
  amount: number;
  currency: string;
  idempotencyKey: string;
}) {
  const supabase = createServiceClient();
  // Resolve the owning customer for order payments so the owner-visibility
  // policy in 0002 applies to them too.
  let customerId = args.customerId ?? null;
  if (!customerId && args.orderId) {
    const { data: owner } = await supabase
      .from("service_orders")
      .select("customer_id")
      .eq("id", args.orderId)
      .maybeSingle();
    customerId = (owner as unknown as { customer_id: string } | null)?.customer_id ?? null;
  }
  const { data, error } = await supabase
    .from("payment_transactions")
    .upsert(
      {
        application_id: args.applicationId ?? null,
        order_id: args.orderId ?? null,
        customer_id: args.customerId ?? null,
        amount: args.amount,
        currency: args.currency,
        status: "confirmed",
        provider: "stripe",
        provider_ref: args.providerRef,
        idempotency_key: args.idempotencyKey,
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    )
    .select("id, status")
    .maybeSingle();
  if (error) throw new Error(`payment_confirm_failed: ${error.message}`);
  return data;
}

export function isServiceConfiguredCheck(): boolean {
  return isServiceConfigured();
}
