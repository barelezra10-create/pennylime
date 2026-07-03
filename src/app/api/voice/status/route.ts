import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";

export const dynamic = "force-dynamic";

/** Child-leg lifecycle events (ringing, in-progress). Final state comes from dial-complete. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/status");
  if (!verified.ok) return verified.response;
  const p = verified.params;

  const parentSid = p.ParentCallSid || p.CallSid;
  const status = p.CallStatus;
  if (parentSid && (status === "ringing" || status === "in-progress")) {
    await prisma.callLog.updateMany({
      where: { twilioCallSid: parentSid, status: { in: ["initiated", "ringing"] } },
      data: { status },
    });
  }

  return new Response("ok", { status: 200 });
}
