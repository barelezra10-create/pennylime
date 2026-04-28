import { NextRequest } from "next/server";
import { checkVerificationCode } from "@/lib/sms/verification";

export async function POST(req: NextRequest) {
  let body: { phone?: string; code?: string; contactId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!body.phone || !body.code) {
    return Response.json({ ok: false, error: "phone and code required" }, { status: 400 });
  }
  const result = await checkVerificationCode({ phone: body.phone, code: body.code, contactId: body.contactId });
  if (!result.ok) return Response.json(result, { status: 400 });
  return Response.json(result);
}
