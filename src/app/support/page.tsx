export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CallsClient } from "@/app/admin/calls/calls-client";
import { SupportShell } from "./support-shell";

export default async function SupportPage() {
  const session = await getServerSession(authOptions);
  const me = session?.user?.email ?? null;
  if (!me) return null;
  const calls = await prisma.callLog.findMany({ where: { direction: "inbound" }, orderBy: { createdAt: "desc" }, take: 200 });
  const contactIds = [...new Set(calls.flatMap(c => c.contactId ? [c.contactId] : []))];
  const contacts = await prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, firstName: true, lastName: true } });
  const names = new Map(contacts.map(c => [c.id, `${c.firstName} ${c.lastName || ""}`.trim()]));
  const callHistory = <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
    <h1 className="text-xl font-semibold mb-1">Calls &amp; voicemails</h1>
    <p className="text-xs text-zinc-500 mb-4">Latest 200 incoming calls · updates every 30 seconds. Missed calls include calls sent to voicemail.</p>
    <CallsClient inboundOnly contactLinks={false} calls={calls.map(c => ({
      id: c.id, contactId: c.contactId, contactName: c.contactId ? names.get(c.contactId) || null : null,
      direction: c.direction, kind: c.kind, fromNumber: c.fromNumber, toNumber: c.toNumber,
      status: c.status, outcome: c.outcome, notes: c.notes, durationSec: c.durationSec,
      hasRecording: !!c.recordingSid, transcription: c.transcription, heard: !!c.heardAt,
      agentEmail: c.agentEmail, createdAt: c.createdAt.toISOString(),
    }))} />
  </section>;
  return <SupportShell callHistory={callHistory} me={me} canManage={(session?.user as { role?: string } | undefined)?.role !== "SUPPORT"} />;
}
