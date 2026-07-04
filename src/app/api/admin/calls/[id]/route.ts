import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const OUTCOMES = ["answered", "no-answer", "voicemail-left", "busy", "wrong-number", "other"];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const body = (await req.json()) as { outcome?: string; notes?: string; heard?: boolean };

  const data: Record<string, unknown> = {};
  if (body.outcome !== undefined) {
    if (body.outcome && !OUTCOMES.includes(body.outcome)) {
      return NextResponse.json({ error: "invalid outcome" }, { status: 400 });
    }
    data.outcome = body.outcome || null;
  }
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.heard === true) data.heardAt = new Date();
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const result = await prisma.callLog.updateMany({
    where: { OR: [{ id }, { twilioCallSid: id }] },
    data,
  });
  if (result.count === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
