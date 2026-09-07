import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTrackingConfig } from "@/lib/tracking/config";
import { listOwnedVoiceNumbers } from "@/lib/voice/numbers";

export const dynamic = "force-dynamic";

/** Owned Twilio voice numbers for the dialer's outbound caller-ID picker. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 });

  const cfg = await getTrackingConfig();
  const numbers = await listOwnedVoiceNumbers();
  return NextResponse.json({ numbers, default: cfg.twilioFromNumber ?? numbers[0]?.number ?? null });
}
