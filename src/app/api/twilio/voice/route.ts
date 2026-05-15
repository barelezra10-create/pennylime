import { NextRequest } from "next/server";

const WSS_URL = process.env.VOICE_RELAY_WSS_URL || "wss://voice.pennylime.com/relay";

export async function POST(_req: NextRequest) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay url="${WSS_URL}"
                       welcomeGreeting="Hi, this is PennyLime support. This call may be recorded and processed by an AI assistant. How can I help?"
                       voice="en-US-Journey-F" />
  </Connect>
</Response>`;
  return new Response(twiml, { status: 200, headers: { "content-type": "text/xml" } });
}

export const GET = POST;
