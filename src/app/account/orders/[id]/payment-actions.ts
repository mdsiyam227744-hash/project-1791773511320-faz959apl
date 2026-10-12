"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createManualSubmission, uploadProof, listEnabledMethods, getMethodById } from "@/lib/payment-methods";

/**
 * Customer-side manual payment submission. The order must belong to the
 * authenticated customer and still be pending_payment; the amount is read
 * from the immutable price snapshot server-side — the browser supplies only
 * the transaction reference, optional proof, and an optional note.
 */

export type ManualPaymentState = { ok: boolean; error?: string };

const schema = z.object({
  orderId: z.string().uuid(),
  methodId: z.string().uuid(),
  orderReference: z.string().trim().min(6).max(24).regex(/^SO-\d{2}-\d{6}$/),
  reference: z.string().trim().min(4).max(200),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function submitManualPayment(
  _prev: ManualPaymentState,
  formData: FormData,
): Promise<ManualPaymentState> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false as const, error: "invalid_input" };
  const { orderId, methodId, orderReference, reference, note } = parsed.data;

  const method = await getMethodById(methodId);
  if (!method || !method.enabled) {
    return { ok: false as const, error: "This payment method is no longer available." };
  }

  // Optional proof upload (private storage bucket, 5 MB, image/PDF only).
  let proofPath: string | null = null;
  const proof = formData.get("proof");
  if (proof instanceof File && proof.size > 0) {
    const up = await uploadProof(user.id, orderId, proof);
    if (!up.ok) {
      return {
        ok: false as const,
        error:
          up.error === "storage_bucket_missing"
            ? "Proof upload is not available yet — submit without a screenshot and our team will confirm manually."
            : (up.error ?? "Upload failed."),
      };
    }
    proofPath = up.path ?? null;
  }

  const result = await createManualSubmission({
    orderId,
    customerId: user.id,
    orderReference,
    method,
    reference,
    proofPath,
    note: note || null,
  });
  if (!result.ok) return { ok: false as const, error: result.error ?? "Submission failed." };

  revalidatePath(`/account/orders/${orderId}`);
  return { ok: true as const };
}

/** Enabled methods for the checkout selector (client component fetches via prop). */
export async function fetchEnabledMethods() {
  await requireUser();
  return listEnabledMethods();
}
