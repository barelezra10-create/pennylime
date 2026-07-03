import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";
import { twimlResponse } from "@/lib/voice/twiml";

export const dynamic = "force-dynamic";

const STATUS_MAP: Record<string, string> = {
  completed: "completed",
  answered: "completed",
  "no-answer": "no-answer",
  busy: "busy",
  failed: "failed",
  canceled: "canceled",
};

/** Dial action callback on the parent leg: final outcome of the client dial. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/dial-complete");
  if (!verified.ok) return verified.response;
  const p = verified.params;

  if (p.CallSid) {
    await prisma.callLog.updateMany({
      where: { twilioCallSid: p.CallSid },
      data: {
        status: STATUS_MAP[p.DialCallStatus] || p.DialCallStatus || "completed",
        durationSec: p.DialCallDuration ? Number(p.DialCallDuration) : undefined,
        endedAt: new Date(),
      },
    });
  }

  return twimlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
}
