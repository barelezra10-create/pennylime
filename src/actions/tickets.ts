"use server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type TicketRow = {
  id: string;
  sessionId: string | null;
  contactName: string | null;
  reason: string;
  transcript: string;
  status: string;
  assignedTo: string | null;
  closedBy: string | null;
  createdAt: string;
};

export async function listSupportTickets(
  filter: "open" | "mine" | "unassigned" | "closed" | "all"
): Promise<TicketRow[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");
  const me = session.user.email;
  const where: Record<string, unknown> = {};
  if (filter === "open") where.status = "open";
  if (filter === "closed") where.status = "closed";
  if (filter === "mine") {
    where.assignedTo = me;
    where.status = "open";
  }
  if (filter === "unassigned") {
    where.assignedTo = null;
    where.status = "open";
  }
  const rows = await prisma.supportTicket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { contact: { select: { firstName: true, lastName: true } } },
  });
  return rows.map((t) => ({
    id: t.id,
    sessionId: t.sessionId,
    contactName: t.contact
      ? `${t.contact.firstName} ${t.contact.lastName ?? ""}`.trim()
      : null,
    reason: t.reason,
    transcript: t.transcript,
    status: t.status,
    assignedTo: t.assignedTo,
    closedBy: t.closedBy,
    createdAt: t.createdAt.toISOString(),
  }));
}

export async function setTicketStatus(id: string, status: "open" | "closed") {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return { ok: false as const, error: "Not authenticated" };
  await prisma.supportTicket.update({
    where: { id },
    data: {
      status,
      closedBy: status === "closed" ? session.user.email : null,
    },
  });
  return { ok: true as const };
}

export async function assignTicketToMe(id: string, assign: boolean) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email)
    return { ok: false as const, error: "Not authenticated" };
  await prisma.supportTicket.update({
    where: { id },
    data: { assignedTo: assign ? session.user.email : null },
  });
  return { ok: true as const };
}

export async function countOpenTickets(): Promise<number> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Unauthorized");
  return prisma.supportTicket.count({ where: { status: "open" } });
}
