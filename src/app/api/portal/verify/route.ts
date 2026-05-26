import { NextRequest } from "next/server";
import { checkVerificationCode } from "@/lib/sms/verification";
import { findApplicationByPhone, signInPortal } from "@/lib/portal-auth";

export async function POST(req: NextRequest) {
  let body: { phone?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!body.phone || !body.code) {
    return Response.json({ ok: false, error: "phone and code required" }, { status: 400 });
  }

  const app = await findApplicationByPhone(body.phone);
  if (!app) {
    return Response.json({ ok: false, error: "No advance found for this phone." }, { status: 404 });
  }

  const result = await checkVerificationCode({ phone: app.phone, code: body.code });
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error || "Invalid code" }, { status: 400 });
  }

  await signInPortal(app.id);
  return Response.json({ ok: true });
}
