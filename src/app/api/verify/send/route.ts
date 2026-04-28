import { NextRequest } from "next/server";
import { sendVerificationCode } from "@/lib/sms/verification";

export async function POST(req: NextRequest) {
  let body: { phone?: string; contactId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!body.phone) return Response.json({ ok: false, error: "phone required" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || undefined;
  const result = await sendVerificationCode({
    phone: body.phone,
    ipAddress: ip,
    contactId: body.contactId,
  });

  if (!result.ok) return Response.json(result, { status: 400 });
  return Response.json({ ok: true, sentTo: result.sentTo, expiresInSeconds: result.expiresInSeconds });
}
