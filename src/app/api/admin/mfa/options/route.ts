import { NextRequest, NextResponse } from "next/server";
import { beginMfa, relyingParty } from "@/lib/security/admin-mfa";
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== relyingParty().origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > 4096) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  try {
    const body = await req.json();
    if (typeof body.email !== "string" || typeof body.password !== "string" ||
      (body.enrollmentCode !== undefined && typeof body.enrollmentCode !== "string")) throw new Error("Invalid request");
    const result = await beginMfa(body.email, body.password, body.enrollmentCode);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Sign-in could not be verified. Check your details and enrollment code, or try again in 15 minutes." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}
