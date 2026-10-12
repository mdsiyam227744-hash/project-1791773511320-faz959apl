"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ORDER_TRANSITIONS, type OrderStatus } from "@/lib/orders";

/**
 * Admin order operations. Every action re-checks staff authorization
 * server-side (requireStaff) and performs a valid transition only — the
 * database trigger is the second, independent boundary.
 */

const actionSchema = z.object({
  order_id: z.string().uuid(),
  action: z.enum(["accept", "info_request", "reject", "cancel"]),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function orderAction(formData: FormData) {
  const { userId, staff } = await requireStaff();
  const parsed = actionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const { order_id, action, note } = parsed.data;

  const target: Record<string, OrderStatus> = {
    accept: "accepted",
    info_request: "info_requested",
    reject: "rejected",
    cancel: "cancelled",
  };
  const to = target[action];
  const supabase = createClient();

  const { data: order } = await supabase
    .from("service_orders")
    .select("status")
    .eq("id", order_id)
    .maybeSingle();
  const current = (order as unknown as { status: OrderStatus } | null)?.status;
  if (!current) return;
  if (!(ORDER_TRANSITIONS[current] ?? []).includes(to)) return;

  const patch: Record<string, unknown> = { status: to };
  if (note) patch.status_note = note;
  if (to === "accepted") {
    patch.accepted_by = userId;
    patch.accepted_at = new Date().toISOString();
  }
  const { error } = await supabase.from("service_orders").update(patch).eq("id", order_id);
  if (error) return;

  await supabase.from("audit_logs").insert({
    actor_id: userId,
    action: `order.${action}`,
    entity: "service_order",
    entity_id: order_id,
    details: { by_role: staff.role, note: note || null },
  });
  revalidatePath("/admin/orders");
  revalidatePath(`/account/orders/${order_id}`);
}

const bookingSchema = z.object({
  order_id: z.string().uuid(),
  booking_ref: z.string().trim().min(4).max(64),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

/**
 * Records a manually confirmed external booking. The operator supplies the
 * real provider reference (PNR / confirmation number) obtained outside the
 * system; the transition guard refuses to confirm a booking without one, so
 * the platform can never fabricate a reservation.
 */
export async function confirmBooking(formData: FormData) {
  const { userId, staff } = await requireStaff();
  const parsed = bookingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const { order_id, booking_ref, note } = parsed.data;

  const supabase = createClient();
  const { data: order } = await supabase
    .from("service_orders")
    .select("status")
    .eq("id", order_id)
    .maybeSingle();
  const current = (order as unknown as { status: OrderStatus } | null)?.status;
  if (!current || !(ORDER_TRANSITIONS[current] ?? []).includes("booking_confirmed")) return;

  const { error } = await supabase
    .from("service_orders")
    .update({
      status: "booking_confirmed",
      external_booking_ref: booking_ref,
      status_note: note || null,
    })
    .eq("id", order_id);
  if (error) return;

  await supabase.from("audit_logs").insert({
    actor_id: userId,
    action: "order.booking_confirmed",
    entity: "service_order",
    entity_id: order_id,
    details: {
      by_role: staff.role,
      booking_ref,
      note: "Manually confirmed with the provider; reference recorded verbatim.",
    },
  });
  revalidatePath("/admin/orders");
  revalidatePath(`/account/orders/${order_id}`);
}

const ticketSchema = z.object({
  order_id: z.string().uuid(),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function markTicketed(formData: FormData) {
  const { userId, staff } = await requireStaff();
  const parsed = ticketSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const { order_id, note } = parsed.data;

  const supabase = createClient();
  const { data: order } = await supabase
    .from("service_orders")
    .select("status")
    .eq("id", order_id)
    .maybeSingle();
  const current = (order as unknown as { status: OrderStatus } | null)?.status;
  if (!current || !(ORDER_TRANSITIONS[current] ?? []).includes("ticketed")) return;

  const { error } = await supabase
    .from("service_orders")
    .update({
      status: "ticketed",
      ticketed_at: new Date().toISOString(),
      status_note: note || null,
    })
    .eq("id", order_id);
  if (error) return;

  await supabase.from("audit_logs").insert({
    actor_id: userId,
    action: "order.ticketed",
    entity: "service_order",
    entity_id: order_id,
    details: { by_role: staff.role, note: note || null },
  });
  revalidatePath("/admin/orders");
  revalidatePath(`/account/orders/${order_id}`);
}

const refundSchema = z.object({
  order_id: z.string().uuid(),
  payment_id: z.string().uuid(),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

/**
 * Processes a refund through the provider when configured (Stripe refund API
 * via the stored payment intent / checkout session reference). Records the
 * refund row and audit entry. Without a configured provider the action is
 * refused — refunds are never simulated.
 */
export async function refundOrder(formData: FormData) {
  const { userId, staff } = await requireStaff();
  const parsed = refundSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const { order_id, payment_id, note } = parsed.data;

  const { configStatus } = await import("@/lib/payments");
  if (!configStatus().configured) return; // honest refusal: no simulated refunds

  const svc = createServiceClient();
  const { data: payment } = await svc
    .from("payment_transactions")
    .select("provider_ref, amount, currency, status, order_id")
    .eq("id", payment_id)
    .maybeSingle();
  const pay = payment as unknown as {
    provider_ref: string;
    amount: number;
    currency: string;
    status: string;
    order_id: string | null;
  } | null;
  if (!pay || pay.status !== "confirmed" || pay.order_id !== order_id) return;

  // Call the Stripe refund API with the checkout session reference.
  const secret = process.env.STRIPE_SECRET_KEY as string;
  const res = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ charge: pay.provider_ref, amount: String(Math.round(pay.amount * 100)) }),
  });
  const json = (await res.json()) as { id?: string; status?: string; error?: { message?: string } };
  if (!res.ok || !json.id) return; // provider refused — do not record a refund

  const { error } = await svc.from("refund_records").insert({
    payment_id,
    amount: pay.amount,
    currency: pay.currency,
    provider: "stripe",
    provider_ref: json.id,
    status: json.status === "succeeded" ? "refunded" : "pending",
    processed_by: userId,
  });
  if (error) return;

  const client = createClient();
  await client.from("service_orders").update({ status: "refunded", status_note: note || null }).eq("id", order_id);
  await client.from("audit_logs").insert({
    actor_id: userId,
    action: "order.refunded",
    entity: "service_order",
    entity_id: order_id,
    details: { by_role: staff.role, refund_provider_ref: json.id, note: note || null },
  });
  revalidatePath("/admin/orders");
  revalidatePath(`/account/orders/${order_id}`);
}

const contactSchema = z.object({
  order_id: z.string().uuid(),
  note: z.string().trim().min(1).max(1000),
});

/** Customer-visible status message without a status change. */
export async function addOrderNote(formData: FormData) {
  const { userId, staff } = await requireStaff();
  const parsed = contactSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const { order_id, note } = parsed.data;

  const supabase = createClient();
  const { error } = await supabase
    .from("service_orders")
    .update({ status_note: note })
    .eq("id", order_id);
  if (error) return;
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    action: "order.note",
    entity: "service_order",
    entity_id: order_id,
    details: { by_role: staff.role },
  });
  revalidatePath("/admin/orders");
  revalidatePath(`/account/orders/${order_id}`);
}
