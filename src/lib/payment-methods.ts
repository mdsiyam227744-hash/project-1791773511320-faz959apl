/**
 * Administrator-configured payment methods and the customer manual-payment
 * submission ledger.
 *
 * Design honesty rules:
 *  - Configured here ≠ payment received. Only an authorized admin approval
 *    (verified against the actual bKash/Nagad/bank/crypto record) moves the
 *    order past the money boundary — enforced again by database triggers in
 *    0005_payment_methods.sql as the second, independent boundary.
 *  - One transaction reference may only ever back one order: enforced by a
 *    database dedupe trigger; this layer surfaces the error in human language.
 *  - Customers can never approve their own payment: the server action requires
 *    staff authorization and the trigger re-checks it in the database.
 *  - No raw card data is ever collected or stored: the "gateway" method holds
 *    only provider names/instructions; the database rejects card-shaped input.
 */
import { createClient, createServiceClient, isSupabaseConfigured } from "./supabase/server";
import type { Locale } from "./i18n";
import {
  PAYMENT_METHOD_KINDS,
  KIND_LABELS,
  validateReference,
  validateProofFile,
  type PaymentMethodKind,
} from "./payment-submissions";

export {
  PAYMENT_METHOD_KINDS,
  KIND_LABELS,
  validateReference,
  validateProofFile,
  type PaymentMethodKind,
} from "./payment-submissions";

// ---------------------------------------------------------------------------
// Payment-method configuration (admin-controlled)
// ---------------------------------------------------------------------------

export interface PaymentMethodRow {
  id: string;
  kind: PaymentMethodKind;
  label_en: string;
  label_bn: string | null;
  account_number: string | null;
  account_name: string | null;
  iban: string | null;
  iban_alt: string | null;
  swift: string | null;
  routing_number: string | null;
  branch: string | null;
  wallet_number: string | null;
  receiving_address: string | null;
  network: string | null;
  gateway_name: string | null;
  instructions_en: string | null;
  instructions_bn: string | null;
  note: string | null;
  supported_currency: string;
  min_amount: number | null;
  enabled: boolean;
  sort_order: number;
}

// KIND_LABELS is re-exported from ./payment-submissions (pure, unit-tested).

/** Column projections keep secrets visible to staff only where they must be. */
const PUBLIC_COLUMNS =
  "id, kind, label_en, label_bn, account_number, account_name, iban, iban_alt, " +
  "swift, routing_number, branch, wallet_number, receiving_address, network, " +
  "gateway_name, instructions_en, instructions_bn, note, supported_currency, " +
  "min_amount, enabled, sort_order";

/** Enabled methods, ordered — what customers choose from at checkout. */
export async function listEnabledMethods(): Promise<PaymentMethodRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("payment_methods")
    .select(PUBLIC_COLUMNS)
    .eq("enabled", true)
    .order("sort_order", { ascending: true });
  return (data ?? []) as unknown as PaymentMethodRow[];
}

/** Full configuration list for the admin panel. */
export async function listAllMethods(): Promise<PaymentMethodRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("payment_methods")
    .select(PUBLIC_COLUMNS)
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });
  return (data ?? []) as unknown as PaymentMethodRow[];
}

export async function getMethodById(id: string): Promise<PaymentMethodRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const { data } = await supabase.from("payment_methods").select(PUBLIC_COLUMNS).eq("id", id).maybeSingle();
  return (data as unknown as PaymentMethodRow) ?? null;
}

// ---------------------------------------------------------------------------
// Submission validation lives in payment-submissions.ts (pure, unit-tested)
// and is re-exported above.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export interface PaymentSubmissionRow {
  id: string;
  order_id: string;
  order_reference: string;
  customer_id: string;
  payment_method_id: string;
  method_kind: PaymentMethodKind;
  submitted_reference: string;
  proof_path: string | null;
  amount: number;
  currency: string;
  status: "pending_verification" | "approved" | "rejected";
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/**
 * Records a customer's manual payment claim for one specific order. Runs with
 * the service client for the price snapshot read (read-only, server-side), but
 * inserts the submission with the user client so RLS pins customer_id to the
 * authenticated user.
 */
export async function createManualSubmission(args: {
  orderId: string;
  customerId: string;
  orderReference: string;
  method: PaymentMethodRow;
  reference: string;
  proofPath: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const fmtError = (code: string): string =>
    ({
      duplicate_payment_reference:
        "This transaction reference has already been used for another order. Check the number and try again, or contact support.",
      payment_amount_mismatch: "The submitted amount does not match this order.",
      no_price_snapshot: "This order has no price record to verify against.",
      order_not_payable: "This order is no longer awaiting payment.",
      payment_method_disabled: "This payment method is no longer available.",
      payment_method_currency_mismatch: "This payment method does not support this order's currency.",
      payment_method_min_amount: "The order total is below this payment method's minimum amount.",
      proof_type: "Proof must be a JPG, PNG, WebP image or PDF.",
      proof_size: "Proof must be 5 MB or smaller.",
      reference_length: "The transaction reference must be 4–200 characters.",
      bkash_format: "A bKash transaction ID is 8–10 letters or digits (TrxID).",
      nagad_format: "A Nagad transaction ID is 8–14 letters or digits.",
      crypto_format: "Enter the transaction hash (0x…) or the transfer reference from your wallet.",
      bank_format: "Enter the bank reference or slip number from your transfer receipt.",
    })[code] ?? "Submission failed. Please check the details and try again.";

  if (!isSupabaseConfigured()) return { ok: false, error: "db_not_configured" };
  const fmt = fmtError;
  const refError = validateReference(args.method.kind, args.reference);
  if (refError) return { ok: false, error: fmt(refError) };

  const svc = createServiceClient();
  const { data: snapshot } = await svc
    .from("order_price_snapshots")
    .select("unit_amount, quantity, currency")
    .eq("order_id", args.orderId);
  const lines = (snapshot ?? []) as unknown as { unit_amount: number; quantity: number; currency: string }[];
  const total = Math.round(lines.reduce((s, l) => s + Number(l.unit_amount) * l.quantity, 0) * 100) / 100;
  const currency = lines[0]?.currency;
  if (currency === undefined) return { ok: false, error: fmt("no_price_snapshot") };
  if (args.method.supported_currency.toUpperCase() !== currency.toUpperCase()) {
    return { ok: false, error: fmt("payment_method_currency_mismatch") };
  }
  if (args.method.min_amount !== null && total < Number(args.method.min_amount)) {
    return { ok: false, error: fmt("payment_method_min_amount") };
  }

  // Ownership + payable state is re-checked here (the order page also checks
  // it; the database trigger is the final boundary).
  const supabase = createClient();
  const { data: orderRow } = await supabase
    .from("service_orders")
    .select("id, customer_id, status, reference_no")
    .eq("id", args.orderId)
    .maybeSingle();
  const order = orderRow as unknown as {
    id: string;
    customer_id: string;
    status: string;
    reference_no: string;
  } | null;
  if (!order || order.customer_id !== args.customerId) return { ok: false, error: "invalid_order" };
  if (order.status !== "pending_payment") return { ok: false, error: fmt("order_not_payable") };
  if (order.reference_no !== args.orderReference) return { ok: false, error: "invalid_order" };
  if (!args.method.enabled) return { ok: false, error: fmt("payment_method_disabled") };

  const { error } = await supabase.from("payment_submissions").insert({
    order_id: args.orderId,
    order_reference: args.orderReference,
    customer_id: args.customerId,
    payment_method_id: args.method.id,
    method_kind: args.method.kind,
    submitted_reference: args.reference.trim(),
    proof_path: args.proofPath,
    amount: total,
    currency,
    note: args.note ?? null,
  });

  if (error) {
    if (error.code === "23505" || /duplicate_payment_reference/.test(error.message)) {
      return { ok: false, error: fmt("duplicate_payment_reference") };
    }
    return { ok: false, error: fmt("db_error") };
  }
  return { ok: true };
}

/** Submissions for the admin verification queue. */
export async function listPendingSubmissions(): Promise<PaymentSubmissionRow[]> {
  if (!isSupabaseConfigured()) return [];
  const svc = createServiceClient();
  const { data } = await svc
    .from("payment_submissions")
    .select("*")
    .eq("status", "pending_verification")
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as PaymentSubmissionRow[];
}

/** Submissions for one order (owner or staff — RLS scopes the read). */
export async function listSubmissionsForOrder(orderId: string): Promise<PaymentSubmissionRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("payment_submissions")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as PaymentSubmissionRow[];
}

/** A short-lived signed URL for an admin viewing a private payment proof. */
export async function proofSignedUrl(
  path: string,
): Promise<{ available: boolean; url?: string; reason?: string }> {
  if (!isSupabaseConfigured()) return { available: false, reason: "db_not_configured" };
  const svc = createServiceClient();
  const { data, error } = await svc.storage
    .from("payment-proofs")
    .createSignedUrl(path, 120);
  if (error || !data) return { available: false, reason: "proof_unavailable" };
  return { available: true, url: data.signedUrl };
}

/** Customer-side proof upload (private bucket; staff-only read via signed URL). */
export async function uploadProof(
  customerId: string,
  orderId: string,
  file: File,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const fmtError = (code: string): string =>
    ({
      proof_type: "Proof must be a JPG, PNG, WebP image or PDF.",
      proof_size: "Proof must be 5 MB or smaller.",
      db_not_configured: "Storage is not configured yet.",
    })[code] ?? "Upload failed. Please try again.";

  const typeError = validateProofFile({ type: file.type, size: file.size });
  if (typeError) return { ok: false, error: fmtError(typeError) };
  if (!isSupabaseConfigured()) return { ok: false, error: fmtError("db_not_configured") };

  const supabase = createClient();
  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1] ?? "bin";
  const path = `${customerId}/${orderId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("payment-proofs")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    if (/not found|does not exist/i.test(error.message)) {
      return { ok: false, error: "storage_bucket_missing" };
    }
    return { ok: false, error: fmtError("db_not_configured") };
  }
  return { ok: true, path };
}
