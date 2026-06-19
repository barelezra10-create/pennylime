import "server-only";
import { prisma } from "@/lib/db";
import { getTrackingConfig } from "@/lib/tracking/config";
import { normalizePhone } from "@/lib/tracking/hash";

export type SendSmsResult =
  | { ok: true; messageId: string; twilioSid: string; status: string }
  | { ok: false; error: string };

export async function sendSms(opts: {
  to: string;
  body: string;
  contactId?: string;
  templateId?: string;
  campaignId?: string;
  statusCallbackBaseUrl?: string;
}): Promise<SendSmsResult> {
  const cfg = await getTrackingConfig();

  if (!cfg.twilioAccountSid || !cfg.twilioAuthToken) {
    return { ok: false, error: "Twilio config incomplete (account SID + auth token required)" };
  }
  if (!cfg.twilioFromNumber && !cfg.twilioMessagingServiceSid) {
    return { ok: false, error: "Set either Twilio from-number or messaging service SID" };
  }

  const to = normalizePhone(opts.to);
  if (!to) return { ok: false, error: "invalid phone number" };

  // Compliance: check opt-out
  if (opts.contactId) {
    const c = await prisma.contact.findUnique({ where: { id: opts.contactId }, select: { smsOptIn: true } });
    if (c && !c.smsOptIn) {
      return { ok: false, error: "contact opted out of SMS" };
    }
  }

  // Persist a queued row first so we always have a record
  const message = await prisma.smsMessage.create({
    data: {
      contactId: opts.contactId,
      toNumber: to,
      fromNumber: cfg.twilioFromNumber || "",
      body: opts.body,
      templateId: opts.templateId,
      campaignId: opts.campaignId,
      status: "queued",
    },
  });

  const params = new URLSearchParams({ To: to, Body: opts.body });
  if (cfg.twilioMessagingServiceSid) params.set("MessagingServiceSid", cfg.twilioMessagingServiceSid);
  else if (cfg.twilioFromNumber) params.set("From", cfg.twilioFromNumber);
  // Always request delivery receipts. Callers may pass an explicit base URL
  // (request-derived); otherwise fall back to the app's configured URL so
  // transactional/cron sends also update SmsMessage.status via /api/twilio/status.
  const callbackBase = (opts.statusCallbackBaseUrl || process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  if (callbackBase) {
    params.set("StatusCallback", `${callbackBase}/api/twilio/status`);
  }

  const auth = Buffer.from(`${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioAccountSid}/Messages.json`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  } catch (err) {
    await prisma.smsMessage.update({
      where: { id: message.id },
      data: { status: "failed", errorMessage: err instanceof Error ? err.message : "network error" },
    });
    return { ok: false, error: "network error" };
  }

  if (!res.ok) {
    const text = await res.text();
    await prisma.smsMessage.update({
      where: { id: message.id },
      data: { status: "failed", errorMessage: text.slice(0, 500), errorCode: String(res.status) },
    });
    return { ok: false, error: `Twilio ${res.status}: ${text.slice(0, 200)}` };
  }

  const data = (await res.json()) as { sid: string; status: string; num_segments?: string; price?: string | null };
  await prisma.smsMessage.update({
    where: { id: message.id },
    data: {
      twilioSid: data.sid,
      status: data.status,
      sentAt: new Date(),
      segments: data.num_segments ? Number(data.num_segments) : 1,
      priceUsd: data.price ? Number(data.price) : null,
    },
  });

  return { ok: true, messageId: message.id, twilioSid: data.sid, status: data.status };
}

const STOP_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
const START_KEYWORDS = ["START", "YES", "UNSTOP"];

export function classifyInbound(body: string): "stop" | "start" | "help" | "other" {
  const norm = body.trim().toUpperCase();
  if (STOP_KEYWORDS.includes(norm)) return "stop";
  if (START_KEYWORDS.includes(norm)) return "start";
  if (norm === "HELP" || norm === "INFO") return "help";
  return "other";
}
