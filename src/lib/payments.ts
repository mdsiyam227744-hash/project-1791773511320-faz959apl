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

export async function createCheckoutForServiceFee(opts: {
  applicationId: string;
  serviceFeeKey: string;
  amount: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}): Promise<CheckoutResult> {
  if (!configStatus().configured) {
    return { available: false, reason: "payments_provider_not_configured" };
  }
  const secret = process.env.STRIPE_SECRET_KEY as string;
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": opts.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(Math.round(opts.amount * 100)),
    "line_items[0][price_data][product_data][name]": `Service fee — ${opts.serviceFeeKey}`,
    "line_items[0][quantity]": "1",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    "metadata[application_id]": opts.applicationId,
    "metadata[service_fee_key]": opts.serviceFeeKey,
  });

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
    applicationId: opts.applicationId,
    amount: opts.amount,
    currency: opts.currency.toUpperCase(),
    provider: "stripe",
    providerRef: json.id,
    idempotencyKey: opts.idempotencyKey,
  });
  return { available: true, url: json.url, sessionId: json.id };
}

export interface RecordTxArgs {
  applicationId: string;
  amount: number;
  currency: string;
  provider: string;
  providerRef: string | null;
  idempotencyKey: string;
}

export async function recordTransaction(args: RecordTxArgs) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("payment_transactions")
    .upsert(
      {
        application_id: args.applicationId,
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
 * Called ONLY from the webhook after signature verification succeeded.
 * Idempotent: replaying the same event cannot double-confirm a payment.
 */
export async function recordConfirmedPayment(args: {
  providerRef: string;
  applicationId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
}) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("payment_transactions")
    .upsert(
      {
        application_id: args.applicationId,
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

