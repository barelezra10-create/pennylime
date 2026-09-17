import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getTrackingConfig } from "@/lib/tracking/config";
import { normalizePhone } from "@/lib/tracking/hash";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";
import { outboundDialTwiml, rejectTwiml, twimlResponse } from "@/lib/voice/twiml";
import { selectCallerId } from "@/lib/voice/caller-id";
import { listOwnedVoiceNumbers } from "@/lib/voice/numbers";

export const dynamic = "force-dynamic";

/** TwiML App voice webhook: the browser leg connected, dial the client. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/outbound");
  if (!verified.ok) return verified.response;
  const p = verified.params;

  const cfg = await getTrackingConfig();
  const to = normalizePhone(p.To);
  const choice = selectCallerId({
    to: p.To || "",
    numbers: await listOwnedVoiceNumbers(),
    defaultNumber: cfg.twilioFromNumber,
    manualNumber: p.callerIdMode === "manual" ? (p.callerId || "").trim() : null,
  });
  const callerId = choice.number;
  const callSid = p.CallSid;

  if (!callerId || !to || !callSid) {
    return twimlResponse(rejectTwiml("Unable to place this call. Check the phone number and voice settings."));
  }

  // identity arrives as "client:<email>" on the From param
  const agentEmail = (p.From || "").startsWith("client:") ? p.From.slice("client:".length) : null;

  await prisma.callLog.upsert({
    where: { twilioCallSid: callSid },
    create: {
      twilioCallSid: callSid,
      contactId: p.contactId || null,
      direction: "outbound",
      kind: "call",
      fromNumber: callerId,
      toNumber: to,
      status: "initiated",
      agentEmail,
      startedAt: new Date(),
    },
    update: {},
  });

  const base = (process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  return twimlResponse(outboundDialTwiml({ callerId, to, baseUrl: base }));
}
