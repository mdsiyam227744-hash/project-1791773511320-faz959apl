/**
 * Payment-method and manual-submission invariants: validators, reference
 * dedupe rules, and the security structure of the new migration.
 * Static analysis — no database required.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateReference,
  validateProofFile,
  PAYMENT_METHOD_KINDS,
  KIND_LABELS,
} from "../../src/lib/payment-submissions.ts";

const M5 = readFileSync("supabase/migrations/0005_payment_methods.sql", "utf8");

// ---------------------------------------------------------------------------
// Reference validation (format + length, per method kind)
// ---------------------------------------------------------------------------

test("bKash transaction IDs are 8-10 alphanumerics", () => {
  assert.equal(validateReference("bkash", "9GV2KX7Q"), null);
  assert.equal(validateReference("bkash", "AB12CD34EF"), null);
  assert.equal(validateReference("bkash", "12 4"), "bkash_format");
  assert.equal(validateReference("bkash", "12"), "reference_length");
  assert.equal(validateReference("bkash", "has space 1"), "bkash_format");
  assert.equal(validateReference("bkash", "toolongtransactionid123"), "bkash_format");
});

test("Nagad transaction IDs are 8-14 alphanumerics", () => {
  assert.equal(validateReference("nagad", "N4GAD1234"), null);
  assert.equal(validateReference("nagad", "12345678901234"), null);
  assert.equal(validateReference("nagad", "sh 1"), "nagad_format");
  assert.equal(validateReference("nagad", "short"), "nagad_format");
  assert.equal(validateReference("nagad", "waytoolongreference12345"), "nagad_format");
});

test("crypto references accept tx hashes and wallet transfer ids", () => {
  const hash = `0x${"a".repeat(64)}`;
  assert.equal(validateReference("crypto", hash), null);
  assert.equal(validateReference("crypto", "ABCDEF123456"), null);
  assert.equal(validateReference("crypto", "0x123"), "crypto_format");
  assert.equal(validateReference("crypto", "no spaces allowed here!"), "crypto_format");
});

test("bank references accept slip numbers with separators", () => {
  assert.equal(validateReference("bank", "FT-2024-0042/ACC1"), null);
  assert.equal(validateReference("bank", "BRANCH 12 SLIP 9"), null);
  assert.equal(validateReference("bank", "bad ref !@#"), "bank_format");
});

test("every reference outside 4-200 characters is rejected for all kinds", () => {
  for (const kind of PAYMENT_METHOD_KINDS) {
    if (kind === "gateway") continue; // gateway payments do not use references
    assert.equal(validateReference(kind, "ab"), "reference_length");
    assert.equal(validateReference(kind, "x".repeat(201)), "reference_length");
  }
});

test("gateway kind is a real member of the method kinds", () => {
  assert.deepEqual([...PAYMENT_METHOD_KINDS], ["bkash", "nagad", "bank", "crypto", "gateway"]);
  assert.equal(KIND_LABELS.gateway.en, "Card / online gateway");
});

test("proof files: images and PDF only, 5 MB cap", () => {
  assert.equal(validateProofFile({ type: "image/jpeg", size: 1024 }), null);
  assert.equal(validateProofFile({ type: "image/png", size: 1024 }), null);
  assert.equal(validateProofFile({ type: "image/webp", size: 1024 }), null);
  assert.equal(validateProofFile({ type: "application/pdf", size: 1024 }), null);
  assert.equal(validateProofFile({ type: "image/gif", size: 1024 }), "proof_type");
  assert.equal(validateProofFile({ type: "application/zip", size: 10 }), "proof_type");
  assert.equal(validateProofFile({ type: "image/jpeg", size: 5 * 1024 * 1024 + 1 }), "proof_size");
});

// ---------------------------------------------------------------------------
// Migration security structure (0005)
// ---------------------------------------------------------------------------

test("0005: method configuration is super-admin only; customers read enabled only", () => {
  assert.match(M5, /create policy payment_methods_superadmin_write on public\.payment_methods\s*\n?\s*for all using \(public\.has_role\('super_admin'\)\)/);
  assert.match(M5, /create policy payment_methods_public_read_enabled on public\.payment_methods\s*\n?\s*for select using \(enabled or public\.is_staff\(\)\)/);
});

test("0005: customers can insert only their own pending submissions", () => {
  assert.match(
    M5,
    /create policy payment_submissions_owner_insert on public\.payment_submissions\s*for insert with check \(\s*customer_id = auth\.uid\(\)\s*and status = 'pending_verification'\s*and reviewed_by is null and reviewed_at is null\s*\)/,
  );
  // Staff-only update, no delete policy at all
  assert.match(M5, /create policy payment_submissions_staff_update on public\.payment_submissions\s*for update using \(public\.is_staff\(\)\)/);
  assert.ok(!/payment_submissions[\s\S]*?for delete/i.test(M5), "no delete policy may exist for submissions");
});

test("0005: only staff can change a submission status, reviewer is pinned", () => {
  const reviewFn = M5.slice(M5.indexOf("guard_payment_submission_review"));
  const body = reviewFn.slice(0, reviewFn.indexOf("end $fn$"));
  assert.match(body, /if not public\.is_staff\(\) then/);
  assert.match(body, /new\.reviewed_by is distinct from auth\.uid\(\)/);
  // approval role gate
  assert.match(body, /new\.status = 'approved'\s*and not \(public\.has_role\('super_admin'\)/);
  // decided rows must record reviewer + time
  assert.match(body, /new\.status <> 'pending_verification'\s*and \(new\.reviewed_by is null or new\.reviewed_at is null\)/);
});

test("0005: approval requires a matching price snapshot and moves the order itself", () => {
  const fn = M5.slice(M5.indexOf("on_payment_submission_approved()"));
  const body = fn.slice(0, fn.indexOf("end $fn$"));
  assert.match(body, /payment_amount_mismatch/);
  assert.match(body, /no_price_snapshot/);
  // the money boundary transition happens inside the trigger
  assert.match(body, /set status = 'payment_verified'/);
  assert.match(body, /o\.status = 'pending_payment'/);
  // an order that is not payable refuses the approval
  assert.match(body, /order_not_payable/);
});

test("0005: duplicate transaction references cannot pay two orders", () => {
  const fn = M5.slice(M5.indexOf("guard_payment_submission_reference()"));
  const body = fn.slice(0, fn.indexOf("end $fn$"));
  assert.match(body, /duplicate_payment_reference/);
  // case/whitespace-insensitive comparison
  assert.match(body, /lower\(btrim\(s\.submitted_reference\)\) = lower\(btrim\(new\.submitted_reference\)\)/);
  // only live submissions block a reference
  assert.match(body, /s\.status in \('pending_verification','approved'\)/);
  // unique constraint backs the trigger
  assert.match(M5, /unique \(payment_method_id, submitted_reference\)/);
});

test("0005: no raw card data can be stored", () => {
  // The migration's CHECK rejects any 15+ digit run (literal SQL regex text).
  assert.ok(M5.includes("\\d{15,}"), "card-shaped digit runs must be rejected");
  // the gateway method has no card-number field at all
  assert.ok(!/card_number|cvv|cvc/i.test(M5));
});

test("0005: proofs live in a private bucket, staff read through server-side URLs", () => {
  assert.match(M5, /insert into storage\.buckets \(id, name, public\)\s*values \('payment-proofs', 'payment-proofs', false\)/);
  assert.match(M5, /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.match(M5, /bucket_id = 'payment-proofs' and public\.is_staff\(\)/);
});

test("0005: submission amounts are stored per order (audit pairs with ledger)", () => {
  // amount and currency snapshot into the submission row
  assert.match(M5, /amount numeric\(12,2\) not null check \(amount >= 0\)/);
  assert.match(M5, /currency char\(3\) not null/);
  // order reference is denormalized for the admin queue
  assert.match(M5, /order_reference text not null/);
});
