import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 });

  const sp = req.nextUrl.searchParams;
  const where: Record<string, unknown> = {};
  if (sp.get("contactId")) where.contactId = sp.get("contactId");
  if (sp.get("direction")) where.direction = sp.get("direction");
  if (sp.get("unheard") === "1") {
    where.kind = "voicemail";
    where.heardAt = null;
  }

  const calls = await prisma.callLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(sp.get("limit") || 100), 500),
  });

  return NextResponse.json({ calls });
}
