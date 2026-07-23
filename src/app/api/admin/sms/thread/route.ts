import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 });

  const contactId = req.nextUrl.searchParams.get("contactId");
  if (!contactId) return NextResponse.json({ error: "contactId required" }, { status: 400 });

  const messages = await prisma.smsMessage.findMany({
    where: { contactId },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      toNumber: true,
      fromNumber: true,
      body: true,
      status: true,
      errorMessage: true,
      sentAt: true,
      deliveredAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      toNumber: m.toNumber,
      fromNumber: m.fromNumber,
      body: m.body,
      status: m.status,
      errorMessage: m.errorMessage,
      sentAt: m.sentAt ? m.sentAt.toISOString() : null,
      deliveredAt: m.deliveredAt ? m.deliveredAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
