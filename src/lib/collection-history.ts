import "server-only";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/tracking/hash";

export type CollectionCommunication = { id: string; channel: string; title: string; body: string; date: string; status: string | null; by: string | null };

/** Exact account links take priority; only unlinked records may match its address/phone. */
export async function collectionCommunications(account: { contactId: string | null; email: string; phone: string | null }) {
  const linked = account.contactId ? [{ contactId: account.contactId }] : [];
  const phone = normalizePhone(account.phone || "");
  const phones = phone ? [...new Set([phone, phone.replace(/^\+/, ""), phone.startsWith("+1") ? phone.slice(2) : phone, account.phone || phone])] : [];
  const phoneWhere = { OR: [...linked, ...(phones.length ? [{ contactId: null, OR: [{ fromNumber: { in: phones } }, { toNumber: { in: phones } }] }] : [])] };
  const emailMatch = { equals: account.email, mode: "insensitive" as const };
  const [calls, sms, emails, sessions, activities, events, tickets] = await Promise.all([
    prisma.callLog.findMany({ where: phoneWhere, orderBy: { createdAt: "desc" } }),
    prisma.smsMessage.findMany({ where: phoneWhere, orderBy: { createdAt: "desc" } }),
    prisma.inboundEmail.findMany({ where: { OR: [...linked, { contactId: null, fromEmail: emailMatch }] }, include: { replies: true } }),
    prisma.agentSession.findMany({ where: { OR: [...linked, { contactId: null, leadEmail: emailMatch }] }, select: { id: true, channel: true, handlingStatus: true, messages: { where: { role: { in: ["user", "assistant"] } }, orderBy: { createdAt: "asc" } } } }),
    account.contactId ? prisma.activity.findMany({ where: { contactId: account.contactId }, orderBy: { createdAt: "desc" } }) : [],
    account.contactId ? prisma.emailEvent.findMany({ where: { contactId: account.contactId }, orderBy: { createdAt: "desc" } }) : [],
    account.contactId ? prisma.supportTicket.findMany({ where: { contactId: account.contactId }, orderBy: { createdAt: "desc" } }) : [],
  ]);
  const rows: CollectionCommunication[] = [];
  for (const c of calls) rows.push({ id: `call:${c.id}`, channel: "Calls", title: `${c.direction} ${c.kind} · ${c.fromNumber} → ${c.toNumber}`, body: [c.durationSec != null ? `Duration: ${c.durationSec}s` : null, c.outcome, c.notes, c.transcription].filter(Boolean).join("\n"), date: (c.startedAt || c.createdAt).toISOString(), status: c.status, by: c.agentEmail });
  for (const s of sms) rows.push({ id: `sms:${s.id}`, channel: "SMS", title: `${s.fromNumber} → ${s.toNumber}`, body: [s.body, s.errorMessage].filter(Boolean).join("\n"), date: s.createdAt.toISOString(), status: s.status, by: null });
  for (const e of emails) {
    rows.push({ id: `email:${e.id}`, channel: "Email", title: e.subject, body: e.bodyText || "No plain-text body stored.", date: e.receivedAt.toISOString(), status: "Received", by: e.fromEmail });
    for (const r of e.replies) rows.push({ id: `reply:${r.id}`, channel: "Email", title: `Re: ${e.subject}`, body: r.body, date: r.createdAt.toISOString(), status: "Sent", by: r.sentBy });
  }
  for (const s of sessions) for (const m of s.messages) rows.push({ id: `message:${m.id}`, channel: s.channel === "sms" ? "SMS" : s.channel === "voice" ? "Calls" : "Chat", title: `${s.channel} · ${m.role === "user" ? "Customer" : m.senderEmail ? "Agent" : "Assistant"}`, body: m.text, date: m.createdAt.toISOString(), status: null, by: m.senderEmail });
  for (const a of activities) rows.push({ id: `activity:${a.id}`, channel: "Activity", title: a.title, body: a.details || "", date: a.createdAt.toISOString(), status: a.type, by: a.performedBy });
  for (const e of events) rows.push({ id: `event:${e.id}`, channel: "Email", title: e.subject || "Email delivery event", body: "", date: e.createdAt.toISOString(), status: e.type, by: null });
  for (const t of tickets) rows.push({ id: `ticket:${t.id}`, channel: "Tickets", title: t.reason, body: t.transcript, date: t.createdAt.toISOString(), status: t.status, by: t.assignedTo });
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
