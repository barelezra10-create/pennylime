import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTrackingConfig } from "@/lib/tracking/config";
import { mintVoiceToken } from "@/lib/voice/token";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const cfg = await getTrackingConfig();
  if (!cfg.twilioAccountSid || !cfg.twilioApiKeySid || !cfg.twilioApiKeySecret || !cfg.twilioTwimlAppSid) {
    return NextResponse.json(
      { error: "Voice is not configured. Set TwiML App SID and API key in Settings > Tracking." },
      { status: 409 }
    );
  }

  const token = mintVoiceToken({
    accountSid: cfg.twilioAccountSid,
    apiKeySid: cfg.twilioApiKeySid,
    apiKeySecret: cfg.twilioApiKeySecret,
    twimlAppSid: cfg.twilioTwimlAppSid,
    identity: session.user.email,
  });

  return NextResponse.json({ token, identity: session.user.email });
}
