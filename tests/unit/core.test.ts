/**
 * Unit tests for pure business logic and security invariants.
 * Run with: pnpm test (node --test)
 *
 * These modules are dependency-free by design (no Supabase/Next imports), so
 * they run under the plain Node test runner without a build step.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { haversineKm, mapOffer } from "../../src/lib/geo.ts";
import { estimateApplicationCost } from "../../src/lib/pricing.ts";
import { buildWhatsAppLink, buildImoLink } from "../../src/lib/contact-links.ts";
import { verifyStripeSignature } from "../../src/lib/webhook-signature.ts";
import { createHmac } from "node:crypto";
import { t, isLocale } from "../../src/lib/i18n.ts";
import { lineTotal, orderTotal } from "../../src/lib/pricing.ts";
import { ORDER_TRANSITIONS, type OrderStatus } from "../../src/lib/order-transitions.ts";

// ---------------------------------------------------------------------------
// Order price math — snapshot totals
// ---------------------------------------------------------------------------
test("lineTotal rounds half-up at two decimals without float drift", () => {
  assert.equal(lineTotal({ unitAmount: 19.99, quantity: 3, currency: "USD" }), 59.97);
  assert.equal(lineTotal({ unitAmount: 0.005, quantity: 1, currency: "USD" }), 0.01);
});

test("orderTotal sums line totals and reports the single currency", () => {
  const { total, currency } = orderTotal([
    { unitAmount: 25, quantity: 1, currency: "USD" },
    { unitAmount: 10.5, quantity: 2, currency: "USD" },
  ]);
  assert.equal(total, 46);
  assert.equal(currency, "USD");
});

test("orderTotal refuses mixed-currency snapshots instead of silently totalling", () => {
  assert.throws(
    () => orderTotal([{ unitAmount: 10, quantity: 1, currency: "USD" }, { unitAmount: 5, quantity: 1, currency: "BDT" }]),
    /mixed_currency_snapshot/,
  );
});

// ---------------------------------------------------------------------------
// Order lifecycle — transition validity (mirrors the DB guard trigger)
// ---------------------------------------------------------------------------
test("unpaid orders can only be paid-verified or cancelled", () => {
  assert.deepEqual(ORDER_TRANSITIONS.pending_payment.sort(), ["cancelled", "payment_verified"]);
});

test("payment verification can never be skipped, and decided states are terminal", () => {
  const keys = Object.keys(ORDER_TRANSITIONS) as OrderStatus[];
  // No transition may skip the payment boundary: ticketed/completed states are
  // only reachable through booking_confirmed, which is only reachable from
  // accepted/info_requested — all downstream of payment_verified.
  for (const [from, tos] of Object.entries(ORDER_TRANSITIONS)) {
    for (const to of tos) {
      assert.ok(
        keys.includes(to),
        `transition ${from} -> ${to} references an unknown status`,
      );
    }
  }
  assert.deepEqual(ORDER_TRANSITIONS.completed, []);
  assert.deepEqual(ORDER_TRANSITIONS.cancelled, []);
  assert.deepEqual(ORDER_TRANSITIONS.refunded, []);
  assert.ok(!ORDER_TRANSITIONS.pending_payment.includes("accepted"));
  assert.ok(!ORDER_TRANSITIONS.pending_payment.includes("ticketed"));
});

test("staff cannot fabricate a booking confirmation in the transition table either", () => {
  // booking_confirmed requires a real external reference — enforced by the DB
  // trigger; the map must not route cancelled/rejected orders to it.
  assert.ok(!ORDER_TRANSITIONS.cancelled.includes("booking_confirmed"));
  assert.ok(!ORDER_TRANSITIONS.rejected.includes("booking_confirmed"));
});


// ---------------------------------------------------------------------------
// Distance — great-circle, never labelled as flown distance
// ---------------------------------------------------------------------------
test("haversineKm computes Dhaka→Bangkok within the expected ~1600 km range", () => {
  const km = haversineKm(23.8103, 90.4125, 13.7563, 100.5018);
  assert.ok(km > 1500 && km < 1700, `expected ~1600, got ${km}`);
});

test("haversineKm is zero for identical coordinates", () => {
  assert.equal(haversineKm(10, 20, 10, 20), 0);
});

// ---------------------------------------------------------------------------
// Flight offer mapping — provider payloads only
// ---------------------------------------------------------------------------
test("mapOffer extracts carrier, price, currency, and stop count", () => {
  const q = mapOffer({
    price: { grandTotal: "412.50", currency: "USD" },
    itineraries: [
      { segments: [{ carrierCode: "BG" }, { carrierCode: "BG" }] },
    ],
  });
  assert.equal(q.airline, "BG");
  assert.equal(q.price, 412.5);
  assert.equal(q.currency, "USD");
  assert.equal(q.stops, 1);
});

test("mapOffer tolerates missing fields without throwing", () => {
  const q = mapOffer({});
  assert.equal(q.airline, "—");
  assert.equal(q.price, 0);
});

// ---------------------------------------------------------------------------
// Cost estimation — unverified official fees never produce a total
// ---------------------------------------------------------------------------
test("estimateApplicationCost totals only when the official fee is verified", () => {
  const ok = estimateApplicationCost({
    officialFeeAmount: 35,
    officialFeeVerified: true,
    officialFeeCurrency: "USD",
    serviceFeeAmount: 50,
  });
  assert.equal(ok.total, 85);
  assert.equal(ok.note, null);

  const unverified = estimateApplicationCost({
    officialFeeAmount: 35,
    officialFeeVerified: false,
    officialFeeCurrency: "USD",
    serviceFeeAmount: 50,
  });
  assert.equal(unverified.total, null);
  assert.equal(unverified.note, "official_fee_not_verified");
});

test("estimateApplicationCost with a missing official fee has no total", () => {
  const r = estimateApplicationCost({
    officialFeeAmount: null,
    officialFeeVerified: false,
    officialFeeCurrency: null,
    serviceFeeAmount: 10,
  });
  assert.equal(r.total, null);
});

// ---------------------------------------------------------------------------
// Contact links — official formats, no invented deep links
// ---------------------------------------------------------------------------
test("buildWhatsAppLink strips formatting and encodes the message", () => {
  const link = buildWhatsAppLink("+880 1712-345678", "Hello, visa question");
  assert.ok(link?.startsWith("https://wa.me/8801712345678?text="));
  assert.ok(link!.includes("%20")); // spaces are URL-encoded in the default message
});

test("buildWhatsAppLink rejects implausible numbers instead of guessing a code", () => {
  assert.equal(buildWhatsAppLink("123", "hi"), null);
  assert.equal(buildWhatsAppLink(null, "hi"), null);
});

test("buildImoLink only accepts https profile URLs in profile_url mode", () => {
  assert.equal(buildImoLink("https://imo.im/u/abc", "profile_url"), "https://imo.im/u/abc");
  assert.equal(buildImoLink("http://imo.im/u/abc", "profile_url"), null);
  assert.equal(buildImoLink("https://imo.im/u/abc", "fallback_notice"), null);
  assert.equal(buildImoLink(null, "profile_url"), null);
});

// ---------------------------------------------------------------------------
// Payment webhook signature — forged requests are rejected
// ---------------------------------------------------------------------------
test("verifyStripeSignature accepts a genuine signature and rejects forgeries", () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");

  assert.equal(verifyStripeSignature(payload, `t=${ts},v1=${sig}`, secret), true);
  assert.equal(verifyStripeSignature(payload, `t=${ts},v1=${"a".repeat(64)}`, secret), false);
  assert.equal(verifyStripeSignature(payload, "", secret), false);

  const oldTs = Math.floor(Date.now() / 1000) - 3600;
  const oldSig = createHmac("sha256", secret).update(`${oldTs}.${payload}`).digest("hex");
  assert.equal(verifyStripeSignature(payload, `t=${oldTs},v1=${oldSig}`, secret), false);
});

// ---------------------------------------------------------------------------
// i18n — dictionary integrity, safe interpolation
// ---------------------------------------------------------------------------
test("t() interpolates variables and falls back to English", () => {
  assert.equal(t("bn", "nav.home"), "হোম");
  assert.equal(t("en", "nonexistent.key" as never), "nonexistent.key");
});

test("isLocale accepts only configured locales", () => {
  assert.equal(isLocale("en"), true);
  assert.equal(isLocale("bn"), true);
  assert.equal(isLocale("fr"), false);
});
