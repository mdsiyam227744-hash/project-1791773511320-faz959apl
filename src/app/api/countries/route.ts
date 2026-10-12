import { NextResponse } from "next/server";
import { listCountries } from "@/lib/catalog";

export async function GET() {
  const countries = await listCountries();
  return NextResponse.json({ countries });
}
