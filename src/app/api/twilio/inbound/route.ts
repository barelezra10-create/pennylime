import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { classifyInbound } from "@/lib/sms/twilio";

/**
 * Twilio Inbound Webhook (incoming SMS).
 * Handles STOP / START / HELP keywords for TCPA compliance.
 * Returns TwiML so Twilio sends an immediate reply for STOP/START/HELP.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const from = String(form.get("From") || "");
  const body = String(form.get("Body") || "");

  if (!from || !body) {
    return new Response("<Response/>", { status: 200, headers: { "content-type": "text/xml" } });
  }

  const action = classifyInbound(body);

  // Find contact by phone (try with and without +1 prefix)
  const candidates = [from, from.replace(/^\+1/, ""), from.replace(/^\+/, "")];
  const contact = await prisma.contact.findFirst({
    where: { phone: { in: candidates } },
  });

  if (action === "stop" && contact) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { smsOptIn: false, smsOptOutAt: new Date() },
    });
  } else if (action === "start" && contact) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { smsOptIn: true, smsOptOutAt: null },
    });
  }

  // Always log the inbound so it shows up in the SMS log
  await prisma.smsMessage.create({
    data: {
      contactId: contact?.id || null,
      toNumber: "(inbound)",
      fromNumber: from,
      body,
      status: action === "stop" ? "opted_out" : action === "start" ? "opted_in" : "received",
    },
  });

  let agentReply: string | null = null;
  if (action === "other" && contact && contact.smsOptIn !== false) {
    try {
      const { runTurn } = await import("@/lib/ai-agent/runTurn");
      const out = await runTurn(body, {
        channel: "sms",
        sessionId: `sms:${contact.id}`,
        contactId: contact.id,
        authLevel: "phone-matched",
        metadata: { from },
      });
      agentReply = out.reply;
    } catch (err) {
      await prisma.agentError.create({
        data: {
          sessionId: `sms:${contact?.id ?? "unknown"}`,
          message: err instanceof Error ? err.message : "sms agent error",
        },
      });
    }
  }

  let reply = "";
  if (action === "stop") {
    reply = "PennyLime: You're unsubscribed and won't receive more texts. Reply START to opt back in.";
  } else if (action === "start") {
    reply = "PennyLime: You're opted in to account alerts. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.";
  } else if (action === "help") {
    reply = "PennyLime account support: info@pennylime.com or pennylime.com. Msg frequency varies, msg & data rates may apply. Reply STOP to opt out, START to opt in.";
  } else if (agentReply) {
    reply = agentReply;
  }

  const twiml = reply
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response/>`;

  return new Response(twiml, { status: 200, headers: { "content-type": "text/xml" } });
}
