import { NextRequest } from "next/server";
import { sendVerificationCode } from "@/lib/sms/verification";
import { findApplicationByPhone } from "@/lib/portal-auth";

export async function POST(req: NextRequest) {
  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!body.phone) {
    return Response.json({ ok: false, error: "phone required" }, { status: 400 });
  }

  // Don't reveal whether a phone exists - send code regardless, fail at
  // verify step. That said, we DO want to short-circuit when we know it
  // won't match anything to avoid using SMS quota on bogus phones. Return
  // a friendly "no record found" if no application exists for this phone.
  const app = await findApplicationByPhone(body.phone);
  if (!app) {
    return Response.json(
      { ok: false, error: "No advance found for this phone number. If you applied, double-check the number." },
      { status: 404 },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || undefined;
  const result = await sendVerificationCode({ phone: app.phone, ipAddress: ip });
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error || "Failed to send code" }, { status: 400 });
  }

  return Response.json({
    ok: true,
    sentTo: result.sentTo,
    expiresInSeconds: result.expiresInSeconds,
    testCode: result.testCode,
  });
}
