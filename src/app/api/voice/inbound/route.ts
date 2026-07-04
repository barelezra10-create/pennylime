import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";
import { phoneCandidates } from "@/lib/voice/phone";
import { inboundVoicemailTwiml, twimlResponse } from "@/lib/voice/twiml";

export const dynamic = "force-dynamic";

/** Toll-free inbound voice: greet and take a voicemail. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/inbound");
  if (!verified.ok) return verified.response;
  const p = verified.params;

  const contact = await prisma.contact.findFirst({
    where: { phone: { in: phoneCandidates(p.From) } },
    select: { id: true },
  });

  if (p.CallSid) {
    await prisma.callLog.upsert({
      where: { twilioCallSid: p.CallSid },
      create: {
        twilioCallSid: p.CallSid,
        contactId: contact?.id || null,
        direction: "inbound",
        kind: "voicemail",
        fromNumber: p.From || "",
        toNumber: p.To || "",
        status: "in-progress",
        startedAt: new Date(),
      },
      update: {},
    });
  }

  const base = (process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  return twimlResponse(inboundVoicemailTwiml({ baseUrl: base }));
}
