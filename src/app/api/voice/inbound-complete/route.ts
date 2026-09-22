import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";
import { inboundVoicemailTwiml, twimlResponse } from "@/lib/voice/twiml";
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/inbound-complete");
  if (!verified.ok) return verified.response;
  const p = verified.params;
  const answered = ["completed", "answered"].includes(p.DialCallStatus);
  if (p.CallSid) await prisma.callLog.updateMany({ where: { twilioCallSid: p.CallSid }, data: answered ? { status: "completed", durationSec: Number(p.DialCallDuration) || 0, endedAt: new Date() } : { kind: "voicemail", status: "in-progress" } });
  if (answered) return twimlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
  const baseUrl = (process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  return twimlResponse(inboundVoicemailTwiml({ baseUrl }));
}
