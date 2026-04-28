import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

/** Twilio Status Callback webhook. Twilio POSTs application/x-www-form-urlencoded. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const sid = String(form.get("MessageSid") || form.get("SmsSid") || "");
  const status = String(form.get("MessageStatus") || form.get("SmsStatus") || "");
  const errorCode = form.get("ErrorCode") ? String(form.get("ErrorCode")) : null;
  const errorMessage = form.get("ErrorMessage") ? String(form.get("ErrorMessage")) : null;

  if (!sid) return new Response("missing sid", { status: 400 });

  const existing = await prisma.smsMessage.findUnique({ where: { twilioSid: sid } });
  if (!existing) return new Response("not found", { status: 200 });

  await prisma.smsMessage.update({
    where: { twilioSid: sid },
    data: {
      status,
      errorCode,
      errorMessage,
      deliveredAt: status === "delivered" ? new Date() : existing.deliveredAt,
    },
  });

  return new Response("ok", { status: 200 });
}
