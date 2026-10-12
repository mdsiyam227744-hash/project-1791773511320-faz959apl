import { NextResponse } from "next/server";
import { searchAirports } from "@/lib/airports";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Airport autocomplete. Authenticated customers and staff only (keeps the
 * reference dataset from being scraped anonymously and bounds query volume).
 * Rate-limited per user.
 */
export async function GET(request: Request) {
  const user = await getSessionUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!checkRateLimit(`airports:${user.id}`, 60, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 60);
  if (q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results = await searchAirports(q, 8);
  return NextResponse.json({ results });
}
