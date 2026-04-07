import { NextRequest, NextResponse } from "next/server";

/**
 * Verify that a cron request has the correct CRON_SECRET header.
 * Returns null if valid, or a 401 NextResponse if invalid.
 */
export function verifyCronSecret(request: NextRequest): NextResponse | null {
  const secret = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    console.error("CRON_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
