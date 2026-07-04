import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTrackingConfig } from "@/lib/tracking/config";

export const dynamic = "force-dynamic";

/** Streams the Twilio recording audio; credentials never leave the server. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const call = await prisma.callLog.findFirst({
    where: { OR: [{ id }, { twilioCallSid: id }] },
    select: { recordingUrl: true },
  });
  if (!call?.recordingUrl) return new NextResponse("No recording", { status: 404 });

  const cfg = await getTrackingConfig();
  if (!cfg.twilioAccountSid || !cfg.twilioAuthToken) {
    return new NextResponse("Voice not configured", { status: 503 });
  }

  const auth = Buffer.from(`${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`).toString("base64");
  const upstream = await fetch(`${call.recordingUrl}.mp3`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!upstream.ok || !upstream.body) return new NextResponse("Recording unavailable", { status: 502 });

  return new NextResponse(upstream.body, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
  });
}
