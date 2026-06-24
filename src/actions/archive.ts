"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { isHandlingStatus } from "@/lib/agent/session-status";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }
  return session.user.email;
}

/* ── Agent Sessions (chats) ────────────────────────────────────── */

export async function archiveAgentSession(sessionId: string) {
  await requireAdmin();
  await prisma.agentSession.update({
    where: { id: sessionId },
    data: { archivedAt: new Date() },
  });
  revalidatePath("/admin/agent/sessions");
  return { ok: true as const };
}

export async function unarchiveAgentSession(sessionId: string) {
  await requireAdmin();
  await prisma.agentSession.update({
    where: { id: sessionId },
    data: { archivedAt: null },
  });
  revalidatePath("/admin/agent/sessions");
  return { ok: true as const };
}

export async function setSessionHandlingStatus(
  sessionId: string,
  status: string
) {
  await requireAdmin();
  if (!isHandlingStatus(status)) {
    return { ok: false as const, error: "Invalid status" };
  }
  await prisma.agentSession.update({
    where: { id: sessionId },
    data: { handlingStatus: status },
  });
  revalidatePath("/admin/agent/sessions");
  revalidatePath(`/admin/agent/sessions/${sessionId}`);
  return { ok: true as const, status };
}

export async function deleteAgentSession(sessionId: string) {
  await requireAdmin();
  // AgentMessage + AgentToolCall + SupportTicket all have onDelete: Cascade
  // on their sessionId FK, so we can just drop the session.
  await prisma.agentSession.delete({ where: { id: sessionId } });
  revalidatePath("/admin/agent/sessions");
  return { ok: true as const };
}

/* ── Contacts (leads) ──────────────────────────────────────────── */

export async function archiveContact(contactId: string) {
  await requireAdmin();
  await prisma.contact.update({
    where: { id: contactId },
    data: { archivedAt: new Date() },
  });
  revalidatePath("/admin/contacts");
  revalidatePath("/admin/pipeline");
  return { ok: true as const };
}

export async function unarchiveContact(contactId: string) {
  await requireAdmin();
  await prisma.contact.update({
    where: { id: contactId },
    data: { archivedAt: null },
  });
  revalidatePath("/admin/contacts");
  revalidatePath("/admin/pipeline");
  return { ok: true as const };
}

/**
 * Hard-delete a contact and its activities/email events/tags. Refuses
 * to delete if the contact has a linked Application — that's a real
 * customer with financial + legal records we MUST keep. Archive
 * those instead.
 */
export async function deleteContact(contactId: string) {
  await requireAdmin();
  const c = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { applicationId: true, email: true },
  });
  if (!c) return { ok: false as const, error: "Contact not found" };
  if (c.applicationId) {
    return {
      ok: false as const,
      error: "Can't delete a contact with a linked application — archive instead.",
    };
  }
  // Activities, EmailEvents, ContactTags, AgentSessions all have
  // onDelete: Cascade on their contactId FK.
  await prisma.contact.delete({ where: { id: contactId } });
  revalidatePath("/admin/contacts");
  revalidatePath("/admin/pipeline");
  return { ok: true as const };
}
