/**
 * Webhook signature verification (Stripe-style: t=<ts>,v1=<hmacsha256>).
 * Dependency-free so it can be unit-tested with the plain Node test runner.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function timingSafeStrEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verifies the signature header against the raw body. Returns true only when
 * the HMAC matches and the timestamp is within the tolerance window.
 */
export function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k.trim(), v?.trim() ?? ""];
    }),
  );
  const timestamp = parts["t"];
  const provided = parts["v1"];
  if (!timestamp || !provided) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return timingSafeStrEq(expected, provided);
}
