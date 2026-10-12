/**
 * Pure, dependency-free payment-submission validation shared by the server
 * library (payment-methods.ts), the checkout form, and the plain-Node tests.
 */

export type PaymentMethodKind = "bkash" | "nagad" | "bank" | "crypto" | "gateway";

export const PAYMENT_METHOD_KINDS: PaymentMethodKind[] = [
  "bkash",
  "nagad",
  "bank",
  "crypto",
  "gateway",
];

/** Display names per method kind, English and Bangla. */
export const KIND_LABELS: Record<PaymentMethodKind, { en: string; bn: string }> = {
  bkash: { en: "bKash", bn: "বিকাশ" },
  nagad: { en: "Nagad", bn: "নগদ" },
  bank: { en: "Bank transfer", bn: "ব্যাংক ট্রান্সফার" },
  crypto: { en: "Cryptocurrency", bn: "ক্রিপ্টোকারেন্সি" },
  gateway: { en: "Card / online gateway", bn: "কার্ড / অনলাইন গেটওয়ে" },
};

/** bKash transaction IDs: 8-10 alphanumeric characters. */
const BKASH_TX_RE = /^[A-Za-z0-9]{8,10}$/;
/** Nagad transaction IDs: 8-14 alphanumeric characters. */
const NAGAD_TX_RE = /^[A-Za-z0-9]{8,14}$/;

export function validateReference(
  kind: PaymentMethodKind,
  reference: string,
): string | null {
  const ref = reference.trim();
  if (ref.length < 4 || ref.length > 200) return "reference_length";
  if (kind === "bkash" && !BKASH_TX_RE.test(ref)) return "bkash_format";
  if (kind === "nagad" && !NAGAD_TX_RE.test(ref)) return "nagad_format";
  if (kind === "crypto" && !/^0x[a-fA-F0-9]{64}$/.test(ref) && !/^[A-Za-z0-9]{12,80}$/.test(ref)) {
    return "crypto_format";
  }
  if (kind === "bank" && !/^[A-Za-z0-9 /._-]{4,60}$/.test(ref)) return "bank_format";
  return null;
}

export function validateProofFile(file: { type: string; size: number }): string | null {
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!allowed.includes(file.type)) return "proof_type";
  if (file.size > 5 * 1024 * 1024) return "proof_size";
  return null;
}
