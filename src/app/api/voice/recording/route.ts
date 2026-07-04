import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";

export const dynamic = "force-dynamic";

/** Recording status callback for both outbound dials and inbound voicemails. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/recording");
  if (!verified.ok) return verified.response;
  const p = verified.params;

  if (p.CallSid && p.RecordingSid) {
    await prisma.callLog.updateMany({
      where: { twilioCallSid: p.CallSid },
      data: {
        recordingSid: p.RecordingSid,
        recordingUrl: p.RecordingUrl || null,
      },
    });
  }

  return new Response("ok", { status: 200 });
}
