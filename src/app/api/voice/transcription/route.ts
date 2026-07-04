import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";

export const dynamic = "force-dynamic";

/** Voicemail transcription callback. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/transcription");
  if (!verified.ok) return verified.response;
  const p = verified.params;

  if (p.CallSid && p.TranscriptionText) {
    await prisma.callLog.updateMany({
      where: { twilioCallSid: p.CallSid },
      data: { transcription: p.TranscriptionText },
    });
  }

  return new Response("ok", { status: 200 });
}
