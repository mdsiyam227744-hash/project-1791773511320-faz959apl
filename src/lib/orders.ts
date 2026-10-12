/**
 * Service-order lifecycle: creation, server-side pricing, price snapshots,
 * and valid state transitions.
 *
 * Hard rules enforced here (and unit-tested):
 *  - Prices are read server-side from the administrator-controlled fee tables
 *    and written to an immutable snapshot at order time. The browser never
 *    supplies a price.
 *  - Mixed-currency snapshots are rejected; a zero-fee order is still recorded
 *    (free service, nothing to pay).
 *  - Only the verified webhook path may move an order to payment_verified.
 */
import { createClient, createServiceClient, isSupabaseConfigured } from "./supabase/server";
import { getFlightServiceFee, FLIGHT_SERVICE_KEY } from "./airports";
import { orderTotal } from "./pricing";
import { canTransition, type OrderStatus } from "./order-transitions";

export { canTransition, ORDER_TRANSITIONS } from "./order-transitions";
export type { OrderStatus } from "./order-transitions";

export interface OrderStatusEvent {
  id: number;
  event_type: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
}

export interface PriceSnapshotLine {
  line_key: string;
  label_en: string;
  label_bn: string | null;
  kind: string;
  unit_amount: number;
  quantity: number;
  currency: string;
  price_source: string;
}

export interface OrderRow {
  id: string;
  reference_no: string;
  customer_id: string;
  service_key: string;
  service_label: string;
  status: OrderStatus;
  status_note: string | null;
  trip_json: Record<string, unknown> | null;
  origin_country: string | null;
  destination_country: string | null;
  origin_airport: string | null;
  destination_airport: string | null;
  depart_date: string | null;
  return_date: string | null;
  trip_type: "one_way" | "return" | null;
  passengers: number | null;
  cabin_class: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  contact_imo: string | null;
  notes: string | null;
  external_booking_ref: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Server-side order pricing
// ---------------------------------------------------------------------------

export interface CreateOrderInput {
  serviceKey: string;
  serviceLabel: string;
  trip: {
    originAirportId: string;
    destinationAirportId: string;
    originCountry: string;
    destinationCountry: string;
    departDate: string;
    returnDate: string | null;
    tripType: "one_way" | "return";
    passengers: number;
    cabinClass: "economy" | "premium_economy" | "business" | "first";
    contactPhone: string;
    contactWhatsapp?: string | null;
    contactImo?: string | null;
    notes?: string | null;
  };
}

export interface CreateOrderResult {
  available: boolean;
  reason?: "db_not_configured" | "service_unavailable" | "invalid_input";
  orderId?: string;
  reference?: string;
  total?: number;
  currency?: string;
}

/**
 * Creates the order and its immutable price snapshot in one server action.
 * The fee is re-read server-side; the client-supplied nothing.
 */
export async function createFlightAssistanceOrder(
  customerId: string,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  if (!isSupabaseConfigured()) return { available: false, reason: "db_not_configured" };
  if (input.serviceKey !== FLIGHT_SERVICE_KEY) {
    return { available: false, reason: "service_unavailable" };
  }

  const fee = await getFlightServiceFee();
  if (!fee) return { available: false, reason: "service_unavailable" };

  const { total, currency } = orderTotal([fee]);
  if (currency === null) return { available: false, reason: "invalid_input" };

  const supabase = createClient();

  // Airport rows must exist and be active — the snapshot references them.
  const { data: airports } = await supabase
    .from("airports")
    .select("id, iso_country, active")
    .in("id", [input.trip.originAirportId, input.trip.destinationAirportId]);
  const rows = (airports ?? []) as unknown as { id: string; iso_country: string; active: boolean }[];
  const origin = rows.find((r) => r.id === input.trip.originAirportId && r.active);
  const dest = rows.find((r) => r.id === input.trip.destinationAirportId && r.active);
  if (!origin || !dest) return { available: false, reason: "invalid_input" };

  const reference = await nextOrderReference(supabase);

  const { data: order, error } = await supabase
    .from("service_orders")
    .insert({
      reference_no: reference,
      customer_id: customerId,
      service_key: FLIGHT_SERVICE_KEY,
      service_label: input.serviceLabel,
      status: "pending_payment",
      trip_json: {
        originAirportId: input.trip.originAirportId,
        destinationAirportId: input.trip.destinationAirportId,
        contactPhone: input.trip.contactPhone,
        contactWhatsapp: input.trip.contactWhatsapp ?? null,
        contactImo: input.trip.contactImo ?? null,
        notes: input.trip.notes ?? null,
      },
      origin_country: input.trip.originCountry.toUpperCase(),
      destination_country: input.trip.destinationCountry.toUpperCase(),
      origin_airport: origin.id,
      destination_airport: dest.id,
      depart_date: input.trip.departDate,
      return_date: input.trip.returnDate,
      trip_type: input.trip.tripType,
      passengers: input.trip.passengers,
      cabin_class: input.trip.cabinClass,
      contact_phone: input.trip.contactPhone,
      contact_whatsapp: input.trip.contactWhatsapp ?? null,
      contact_imo: input.trip.contactImo ?? null,
      notes: input.trip.notes ?? null,
    })
    .select("id, reference_no")
    .single();

  if (error) return { available: false, reason: "db_not_configured" };

  // Immutable price snapshot — the exact lines the customer saw. Written with
  // the server-only service client: customers must never be able to write
  // their own price lines (RLS allows staff/service writes only).
  const svc = createServiceClient();
  const { error: snapErr } = await svc.from("order_price_snapshots").insert({
    order_id: order.id as string,
    line_key: fee.lineKey,
    label_en: fee.labelEn,
    label_bn: fee.labelBn,
    kind: fee.kind,
    unit_amount: fee.unitAmount,
    quantity: fee.quantity,
    currency: fee.currency,
    price_source: fee.priceSource,
  });
  if (snapErr) return { available: false, reason: "db_not_configured" };

  return { available: true, orderId: order.id as string, reference: order.reference_no as string, total, currency };
}

async function nextOrderReference(supabase: ReturnType<typeof createClient>): Promise<string> {
  // Client-side generation matching next_service_order_reference(); the unique
  // index is the real guarantee. Retry on collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const seq = Math.floor(100000 + Math.random() * 900000);
    const yy = String(new Date().getFullYear()).slice(-2);
    const reference = `SO-${yy}-${seq}`;
    const { data } = await supabase
      .from("service_orders")
      .select("id")
      .eq("reference_no", reference)
      .maybeSingle();
    if (!data) return reference;
  }
  throw new Error("reference_generation_failed");
}

// ---------------------------------------------------------------------------
// Reading orders (owner- or staff-scoped; RLS is the second boundary)
// ---------------------------------------------------------------------------

export async function getOrderByReference(reference: string): Promise<OrderRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from("service_orders")
    .select("*")
    .eq("reference_no", reference)
    .maybeSingle();
  return (data as unknown as OrderRow) ?? null;
}

export async function getOrderEvents(orderId: string): Promise<OrderStatusEvent[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("service_order_events")
    .select("id, event_type, from_status, to_status, note, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as OrderStatusEvent[];
}

export async function getOrderSnapshot(orderId: string): Promise<PriceSnapshotLine[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("order_price_snapshots")
    .select("line_key, label_en, label_bn, kind, unit_amount, quantity, currency, price_source")
    .eq("order_id", orderId);
  return (data ?? []) as unknown as PriceSnapshotLine[];
}

export function snapshotTotal(
  lines: { unit_amount: number | string; quantity: number; currency: string }[],
): { total: number; currency: string | null } {
  return orderTotal(
    lines.map((l) => ({ unitAmount: Number(l.unit_amount), quantity: l.quantity, currency: l.currency })),
  );
}

/**
 * Webhook-side integrity check: the amount and currency in the provider
 * payload must match the order's immutable price snapshot. Throws
 * payment_amount_mismatch on any divergence — the webhook then refuses to
 * acknowledge the event so the provider retries.
 */
export async function verifyOrderPaymentIntegrity(
  orderId: string,
  webhookAmount: number,
  webhookCurrency: string,
): Promise<void> {
  const lines = await getOrderSnapshot(orderId);
  const { total, currency } = snapshotTotal(lines);
  if (currency === null || currency !== webhookCurrency.toUpperCase() || Math.abs(total - webhookAmount) > 0.005) {
    throw new Error(
      `payment_amount_mismatch: snapshot ${total} ${currency} vs webhook ${webhookAmount} ${webhookCurrency}`,
    );
  }
}

/**
 * Moves a paid order into the operational queue. Runs with the service client
 * (no interactive user), which is the only context the database transition
 * guard accepts for pending_payment -> payment_verified.
 */
export async function markOrderPaymentVerified(orderId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: updated, error } = await supabase
    .from("service_orders")
    .update({ status: "payment_verified" })
    .eq("id", orderId)
    .eq("status", "pending_payment")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`order_transition_failed: ${error.message}`);
  if (updated === null) {
    // Either already verified (idempotent replay) or in an unexpected state.
    const { data: existing } = await supabase
      .from("service_orders")
      .select("status")
      .eq("id", orderId)
      .maybeSingle();
    if ((existing as unknown as { status: string } | null)?.status !== "payment_verified") {
      throw new Error("order_transition_failed");
    }
  }
}

// ---------------------------------------------------------------------------
// Payment initiation — re-prices from the snapshot, never from the browser
// ---------------------------------------------------------------------------

/**
 * Confirms a zero-fee order through the same integrity rules as a paid one:
 * the snapshot must total exactly zero, and the transition runs with the
 * service client so the database guard accepts it. The provider is recorded
 * honestly as an internal zero-amount confirmation — no gateway, no simulated
 * card charge, no receipt that pretends money moved.
 */
export async function recordZeroFeeOrderPayment(args: { orderId: string }) {
  const lines = await getOrderSnapshot(args.orderId);
  const { total, currency } = snapshotTotal(lines);
  if (currency === null || total !== 0) {
    throw new Error("not_a_zero_fee_order");
  }
  const supabase = createServiceClient();
  const { data: order } = await supabase
    .from("service_orders")
    .select("customer_id")
    .eq("id", args.orderId)
    .maybeSingle();
  const customerId = (order as unknown as { customer_id: string } | null)?.customer_id ?? null;
  const { data: payment, error } = await supabase
    .from("payment_transactions")
    .upsert(
      {
        order_id: args.orderId,
        customer_id: customerId,
        amount: 0,
        currency,
        status: "confirmed",
        provider: "internal_zero_fee",
        provider_ref: `zero:${args.orderId}`,
        idempotency_key: `zero:${args.orderId}`,
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    )
    .select("id, status")
    .maybeSingle();
  if (error) throw new Error(`zero_fee_confirm_failed: ${error.message}`);

  const { data: updated } = await supabase
    .from("service_orders")
    .update({ status: "payment_verified" })
    .eq("id", args.orderId)
    .eq("status", "pending_payment")
    .select("id")
    .maybeSingle();
  if (updated === null) {
    const { data: existing } = await supabase
      .from("service_orders")
      .select("status")
      .eq("id", args.orderId)
      .maybeSingle();
    if ((existing as unknown as { status: string } | null)?.status !== "payment_verified") {
      throw new Error("order_transition_failed");
    }
  }
  return payment;
}

// ---------------------------------------------------------------------------
// Payment initiation — re-prices from the snapshot, never from the browser
// ---------------------------------------------------------------------------

export async function initiateOrderCheckout(orderId: string, customerId: string, origin: string) {
  if (!isSupabaseConfigured()) return { available: false, reason: "db_not_configured" as const };
  const supabase = createClient();

  const { data: order } = await supabase
    .from("service_orders")
    .select("id, reference_no, customer_id, status, service_label")
    .eq("id", orderId)
    .maybeSingle();
  const row = order as unknown as {
    id: string;
    reference_no: string;
    customer_id: string;
    status: OrderStatus;
    service_label: string;
  } | null;
  if (!row || row.customer_id !== customerId) {
    return { available: false, reason: "invalid_input" as const };
  }
  if (row.status !== "pending_payment") {
    return { available: false, reason: "not_pending_payment" as const };
  }

  const lines = await getOrderSnapshot(orderId);
  const { total, currency } = snapshotTotal(lines);
  if (currency === null) return { available: false, reason: "invalid_input" as const };

  if (total === 0) {
    try {
      await recordZeroFeeOrderPayment({ orderId });
      return { available: true, free: true as const };
    } catch {
      return { available: false, reason: "db_not_configured" as const };
    }
  }

  const { configStatus, createCheckoutForServiceFee } = await import("./payments");
  if (!configStatus().configured) {
    return { available: false, reason: "payments_provider_not_configured" as const };
  }

  const idempotencyKey = `order:${orderId}`;
  const result = await createCheckoutForServiceFee({
    orderId,
    serviceFeeKey: row.service_label,
    amount: total,
    currency,
    successUrl: `${origin}/account/orders/${orderId}`,
    cancelUrl: `${origin}/account/orders/${orderId}`,
    idempotencyKey,
  });
  if (!result.available || !result.url) {
    return { available: false, reason: (result.reason ?? "payments_provider_error") as string };
  }
  return { available: true, url: result.url };
}
