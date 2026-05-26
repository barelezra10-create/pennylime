"use server";

import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type InboxFilter = "ALL" | "UNREAD" | "UNMATCHED" | "MATCHED" | "ARCHIVED";

export type InboxRow = {
  id: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  preview: string;
  receivedAt: string;
  status: string;
  contact: { id: string; firstName: string; lastName: string | null } | null;
};

export async function getInbox(filter: InboxFilter = "ALL"): Promise<InboxRow[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return [];

  const where: Record<string, unknown> = {};
  switch (filter) {
    case "UNREAD":
      where.status = "UNREAD";
      break;
    case "UNMATCHED":
      where.contactId = null;
      where.status = { not: "ARCHIVED" };
      break;
    case "MATCHED":
      where.contactId = { not: null };
      where.status = { not: "ARCHIVED" };
      break;
    case "ARCHIVED":
      where.status = "ARCHIVED";
      break;
    case "ALL":
    default:
      where.status = { not: "ARCHIVED" };
  }

  const rows = await prisma.inboundEmail.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: 200,
  });

  const contactIds = rows
    .map((r) => r.contactId)
    .filter((id): id is string => !!id);
  const contacts =
    contactIds.length > 0
      ? await prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
  const byId = new Map(contacts.map((c) => [c.id, c]));

  return rows.map((r) => ({
    id: r.id,
    fromEmail: r.fromEmail,
    fromName: r.fromName,
    subject: r.subject,
    preview: r.bodyText.replace(/\s+/g, " ").trim().slice(0, 200),
    receivedAt: r.receivedAt.toISOString(),
    status: r.status,
    contact: r.contactId ? byId.get(r.contactId) || null : null,
  }));
}

export type InboxMessageDetail = {
  id: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  receivedAt: string;
  status: string;
  contact: { id: string; firstName: string; lastName: string | null; email: string } | null;
};

export async function getInboxMessage(id: string): Promise<InboxMessageDetail | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const row = await prisma.inboundEmail.findUnique({ where: { id } });
  if (!row) return null;

  // Auto-mark as READ on open. Saves a click.
  if (row.status === "UNREAD") {
    await prisma.inboundEmail.update({
      where: { id },
      data: { status: "READ" },
    });
    row.status = "READ";
  }

  const contact = row.contactId
    ? await prisma.contact.findUnique({
        where: { id: row.contactId },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : null;

  return {
    id: row.id,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    toEmail: row.toEmail,
    subject: row.subject,
    bodyText: row.bodyText,
    bodyHtml: row.bodyHtml,
    receivedAt: row.receivedAt.toISOString(),
    status: row.status,
    contact,
  };
}

export async function setInboxStatus(
  id: string,
  status: "UNREAD" | "READ" | "REPLIED" | "ARCHIVED",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Not authenticated" };

  await prisma.inboundEmail.update({
    where: { id },
    data: { status },
  });
  return { ok: true };
}

/**
 * Convert an unmatched inbound email into a Contact. Useful when an
 * unknown person emails info@ and we want to start a CRM conversation.
 * Links the InboundEmail row to the new Contact + flips status to READ.
 */
export async function convertInboxToContact(
  id: string,
): Promise<{ ok: true; contactId: string } | { ok: false; error: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Not authenticated" };

  const row = await prisma.inboundEmail.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Inbound email not found" };
  if (row.contactId) return { ok: false, error: "Already linked to a contact" };

  const existing = await prisma.contact.findUnique({
    where: { email: row.fromEmail },
    select: { id: true },
  });
  if (existing) {
    await prisma.inboundEmail.update({
      where: { id },
      data: { contactId: existing.id, status: "READ" },
    });
    return { ok: true, contactId: existing.id };
  }

  // Best-effort name split. If we have "Alice Foo" we get first/last; if
  // just "alice" we use the local-part of the email.
  const name = row.fromName?.trim() || row.fromEmail.split("@")[0];
  const parts = name.split(/\s+/);
  const firstName = parts[0] || row.fromEmail.split("@")[0];
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;

  const contact = await prisma.contact.create({
    data: {
      firstName,
      lastName,
      email: row.fromEmail,
      stage: "LEAD",
      source: "inbound_email",
    },
  });
  await prisma.inboundEmail.update({
    where: { id },
    data: { contactId: contact.id, status: "READ" },
  });

  await logAudit({
    action: "CHANGE_SETTING",
    entityType: "ADMIN_USER",
    entityId: contact.id,
    performedBy: session.user.email,
    details: {
      kind: "INBOX_TO_CONTACT",
      inboundEmailId: id,
      email: row.fromEmail,
    },
  });

  return { ok: true, contactId: contact.id };
}

export async function getInboxCounts(): Promise<{ unread: number; unmatched: number }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { unread: 0, unmatched: 0 };

  const [unread, unmatched] = await Promise.all([
    prisma.inboundEmail.count({ where: { status: "UNREAD" } }),
    prisma.inboundEmail.count({
      where: { contactId: null, status: { not: "ARCHIVED" } },
    }),
  ]);
  return { unread, unmatched };
}
