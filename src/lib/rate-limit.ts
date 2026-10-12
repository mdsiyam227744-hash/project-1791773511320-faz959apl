/**
 * Dependency-free in-memory rate limiter shared by API routes and server
 * actions. Per-key sliding-window counter. Adequate for a single Next.js
 * instance; note in STATUS-REPORT: a multi-instance deployment should move
 * this to the database or a shared store.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

/** Occasional sweep so the map cannot grow unbounded. */
export function sweepRateLimits(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}
