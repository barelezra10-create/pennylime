import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";
import { voicemailDoneTwiml, twimlResponse } from "@/lib/voice/twiml";

export const dynamic = "force-dynamic";

/** Record action callback: the caller finished leaving a voicemail. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/voicemail-done");
  if (!verified.ok) return verified.response;
  const p = verified.params;

  if (p.CallSid) {
    await prisma.callLog.updateMany({
      where: { twilioCallSid: p.CallSid },
      data: {
        status: "completed",
        durationSec: p.RecordingDuration ? Number(p.RecordingDuration) : undefined,
        endedAt: new Date(),
      },
    });
  }

  return twimlResponse(voicemailDoneTwiml());
}
