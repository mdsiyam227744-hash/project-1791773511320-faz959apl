import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { airportPairDistance } from "@/lib/aviation";

/**
 * Airport-pair great-circle distance. Authenticated + rate-limited like the
 * autocomplete route. Missing/invalid coordinates yield an honest
 * no-distance response, never a number.
 */
export async function POST(request: Request) {
  const user = await getSessionUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!checkRateLimit(`distance:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as {
    origin_airport_id?: string;
    destination_airport_id?: string;
  } | null;
  const origin = body?.origin_airport_id;
  const destination = body?.destination_airport_id;
  if (!origin || !destination || !/^[0-9a-f-]{36}$/i.test(origin) || !/^[0-9a-f-]{36}$/i.test(destination)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await airportPairDistance(origin, destination);
  return NextResponse.json({
    ok: result.ok,
    distanceKm: result.distanceKm,
    reason: result.reason,
    method: result.method,
    methodVersion: result.methodVersion,
    earthRadiusKm: result.earthRadiusKm,
  });
}
