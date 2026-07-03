import { NextRequest } from "next/server";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";
import { whisperTwiml, twimlResponse } from "@/lib/voice/twiml";

export const dynamic = "force-dynamic";

/** Runs on the client leg the moment they answer, before bridging. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/whisper");
  if (!verified.ok) return verified.response;
  return twimlResponse(whisperTwiml());
}
