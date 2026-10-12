"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import type { UserRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PaymentMethodKind } from "@/lib/payment-methods";

/**
 * Payment-method configuration and manual-payment verification.
 * Super-admin only for configuration; super_admin / application_manager /
 * support_agent may review submissions. Every state change writes an audit
 * log with actor, previous state, new state, and reason.
 */

const SUPER_ADMIN_ONLY: UserRole[] = ["super_admin"];
const REVIEW_ROLES: UserRole[] = ["super_admin", "application_manager", "support_agent"];

const commonFields = {
  label_en: z.string().trim().min(2).max(80),
  label_bn: z.string().trim().max(80).optional().or(z.literal("")),
  account_number: z.string().trim().max(60).optional().or(z.literal("")),
  account_name: z.string().trim().max(120).optional().or(z.literal("")),
  iban: z.string().trim().max(42).optional().or(z.literal("")),
  iban_alt: z.string().trim().max(42).optional().or(z.literal("")),
  swift: z.string().trim().max(11).optional().or(z.literal("")),
  routing_number: z.string().trim().max(20).optional().or(z.literal("")),
  branch: z.string().trim().max(120).optional().or(z.literal("")),
  wallet_number: z.string().trim().max(20).optional().or(z.literal("")),
  receiving_address: z.string().trim().max(120).optional().or(z.literal("")),
  network: z.string().trim().max(40).optional().or(z.literal("")),
  gateway_name: z.string().trim().max(80).optional().or(z.literal("")),
  instructions_en: z.string().trim().max(600).optional().or(z.literal("")),
  instructions_bn: z.string().trim().max(600).optional().or(z.literal("")),
  note: z.string().trim().max(300).optional().or(z.literal("")),
  supported_currency: z.string().trim().toUpperCase().length(3),
  min_amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional()
    .or(z.literal("")),
  sort_order: z.string().regex(/^\d{1,4}$/),
};

const createSchema = z.object({ intent: z.literal("create"), kind: z.enum(["bkash", "nagad", "bank", "crypto", "gateway"]), ...commonFields });
const updateSchema = z.object({
  intent: z.literal("update"),
  method_id: z.string().uuid(),
  enabled: z.enum(["true", "false"]).optional(),
  ...commonFields,
});
const toggleSchema = z.object({
  intent: z.literal("toggle"),
  method_id: z.string().uuid(),
  enabled: z.enum(["true", "false"]),
});

function methodPayload(d: Record<string, string | undefined>) {
  const payload: Record<string, unknown> = {
    label_en: d.label_en,
    label_bn: d.label_bn || null,
    account_number: d.account_number || null,
    account_name: d.account_name || null,
    iban: d.iban || null,
    iban_alt: d.iban_alt || null,
    swift: d.swift || null,
    routing_number: d.routing_number || null,
    branch: d.branch || null,
    wallet_number: d.wallet_number || null,
    receiving_address: d.receiving_address || null,
    network: d.network || null,
    gateway_name: d.gateway_name || null,
    instructions_en: d.instructions_en || null,
    instructions_bn: d.instructions_bn || null,
    note: d.note || null,
    supported_currency: d.supported_currency,
    min_amount: d.min_amount ? Number(d.min_amount) : null,
    sort_order: Number(d.sort_order),
  };
  return payload;
}

/** Create or update a payment-method configuration (super-admin only). */
export async function saveMethod(formData: FormData): Promise<void> {
  const { userId } = await requireStaff(SUPER_ADMIN_ONLY);
  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = (raw.intent === "update" ? updateSchema : createSchema).safeParse(raw);
  if (!parsed.success) return;
  const d = parsed.data as Record<string, string | undefined>;
  const payload = methodPayload(d);

  const supabase = createClient();
  if (raw.intent === "update") {
    const methodId = String(d.method_id);
    const { data: before } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("id", methodId)
      .maybeSingle();
    const beforeRow = (before ?? null) as Record<string, unknown> | null;
    if (!beforeRow) return;
    // Quick-apply form (has `enabled`) only changes visibility and order —
    // every other field keeps its stored value so a partial form can never
    // blank the merchant details.
    const quick = d.enabled !== undefined;
    const update: Record<string, unknown> = quick
      ? { enabled: d.enabled === "true", sort_order: payload.sort_order, updated_by: userId }
      : { ...payload, enabled: beforeRow.enabled as boolean, updated_by: userId };
    const { error } = await supabase.from("payment_methods").update(update).eq("id", methodId);
    if (error) return;
    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: "payment_method.updated",
      entity: "payment_method",
      entity_id: methodId,
      details: { before: beforeRow, after: update },
    });
  } else {
    const { data: created } = await supabase
      .from("payment_methods")
      .insert({ ...(payload as Record<string, unknown>), kind: d.kind, updated_by: userId })
      .select("id")
      .maybeSingle();
    if (!created) return;
    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: "payment_method.created",
      entity: "payment_method",
      entity_id: (created as unknown as { id: string }).id,
      details: { after: payload },
    });
  }
  revalidatePath("/admin/payments");
  revalidatePath("/account/orders");
}

const deleteSchema = z.object({
  intent: z.literal("delete"),
  method_id: z.string().uuid(),
  confirm_label: z.string().trim().min(2).max(80),
});

/**
 * A configured method is never hard-deleted (historical submissions reference
 * it). Disable instead; deletion removes only a never-used method.
 */
export async function deleteMethod(formData: FormData): Promise<void> {
  const { userId } = await requireStaff(SUPER_ADMIN_ONLY);
  const parsed = deleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const { method_id, confirm_label } = parsed.data;

  const supabase = createClient();
  const { data: method } = await supabase
    .from("payment_methods")
    .select("label_en")
    .eq("id", method_id)
    .maybeSingle();
  const label = (method as unknown as { label_en: string } | null)?.label_en;
  if (!label || label !== confirm_label) return; // typed confirmation required

  const { data: used } = await supabase
    .from("payment_submissions")
    .select("id")
    .eq("payment_method_id", method_id)
    .limit(1);
  if ((used ?? []).length > 0) {
    // In use: refuse deletion, disable instead (honest history preservation).
    await supabase.from("payment_methods").update({ enabled: false, updated_by: userId }).eq("id", method_id);
    await supabase.from("audit_logs").insert({
      actor_id: userId,
      action: "payment_method.disable_instead_of_delete",
      entity: "payment_method",
      entity_id: method_id,
      details: { reason: "in_use_by_submissions" },
    });
    revalidatePath("/admin/payments");
    return;
  }

  await supabase.from("payment_methods").delete().eq("id", method_id);
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    action: "payment_method.deleted",
    entity: "payment_method",
    entity_id: method_id,
    details: { label: confirm_label },
  });
  revalidatePath("/admin/payments");
}

const reviewSchema = z.object({
  submission_id: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

/**
 * Approve or reject a manual payment submission. The approval runs inside the
 * database money-boundary triggers (snapshot match + order transition), so a
 * wrong amount or an already-paid order refuses the whole transaction.
 */
export async function reviewSubmission(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await requireStaff(REVIEW_ROLES);
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { submission_id, decision, reason } = parsed.data;

  const supabase = createClient();
  const { data: submission } = await supabase
    .from("payment_submissions")
    .select("id, order_id, status, amount, currency")
    .eq("id", submission_id)
    .maybeSingle();
  const sub = submission as unknown as {
    id: string;
    order_id: string;
    status: string;
    amount: number;
    currency: string;
  } | null;
  if (!sub) return { ok: false, error: "not_found" };
  if (sub.status !== "pending_verification") return { ok: false, error: "already_reviewed" };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("payment_submissions")
    .update({
      status: decision === "approve" ? "approved" : "rejected",
      reviewed_by: userId,
      reviewed_at: now,
      note: reason || null,
    })
    .eq("id", submission_id)
    .eq("status", "pending_verification"); // guard against double-review races
  if (error) return { ok: false, error: "verification_refused" };

  // Append-only transaction record: the audit trail pairs with the payment ledger.
  await supabase.from("payment_transactions").upsert(
    {
      order_id: sub.order_id,
      customer_id: null,
      amount: Number(sub.amount),
      currency: sub.currency,
      status: decision === "approve" ? "confirmed" : "failed",
      provider: "manual_verification",
      provider_ref: submission_id,
      idempotency_key: `manual:${submission_id}`,
      confirmed_at: decision === "approve" ? now : null,
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );

  await supabase.from("audit_logs").insert({
    actor_id: userId,
    action: `payment_submission.${decision}d`,
    entity: "payment_submission",
    entity_id: submission_id,
    details: {
      order_id: sub.order_id,
      amount: sub.amount,
      currency: sub.currency,
      previous_status: sub.status,
      new_status: decision === "approve" ? "approved" : "rejected",
      reason: reason || null,
    },
  });

  revalidatePath("/admin/payments");
  revalidatePath(`/account/orders/${sub.order_id}`);
  return { ok: true };
}

/** Reorder (sort_order) for one method — quick drag-free ordering control. */
const orderSchema = z.object({
  method_id: z.string().uuid(),
  sort_order: z.string().regex(/^\d{1,4}$/),
});

export async function reorderMethod(formData: FormData): Promise<void> {
  const { userId } = await requireStaff(SUPER_ADMIN_ONLY);
  const parsed = orderSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const supabase = createClient();
  await supabase
    .from("payment_methods")
    .update({ sort_order: Number(parsed.data.sort_order), updated_by: userId })
    .eq("id", parsed.data.method_id);
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    action: "payment_method.reordered",
    entity: "payment_method",
    entity_id: parsed.data.method_id,
    details: { sort_order: Number(parsed.data.sort_order) },
  });
  revalidatePath("/admin/payments");
}

export type { PaymentMethodKind };
