import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";
import { phoneCandidates } from "@/lib/voice/phone";
import { inboundSupportTwiml, twimlResponse } from "@/lib/voice/twiml";

export const dynamic = "force-dynamic";

/** Ring available browser agents; fall back to voicemail. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/inbound");
  if (!verified.ok) return verified.response;
  const p = verified.params;

  const contact = await prisma.contact.findFirst({
    where: { phone: { in: phoneCandidates(p.From) } },
    select: { id: true },
  });

  const agents = await prisma.adminUser.findMany({ where: { voiceAvailableUntil: { gt: new Date() } }, select: { email: true }, orderBy: { voiceAvailableUntil: "desc" }, take: 10 });

  if (p.CallSid) {
    await prisma.callLog.upsert({
      where: { twilioCallSid: p.CallSid },
      create: {
        twilioCallSid: p.CallSid,
        contactId: contact?.id || null,
        direction: "inbound",
        kind: agents.length ? "support" : "voicemail",
        fromNumber: p.From || "",
        toNumber: p.To || "",
        status: "in-progress",
        startedAt: new Date(),
      },
      update: {},
    });
  }

  const base = (process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  return twimlResponse(inboundSupportTwiml({ baseUrl: base, identities: agents.map(a => a.email), callSid: p.CallSid || "" }));
}
