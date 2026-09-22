import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { CallsClient } from "../calls/calls-client";
import { DialerWorkspace } from "./dialer-workspace";

export const dynamic = "force-dynamic";

export default async function DialerPage() {
  const contacts = await prisma.contact.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      stage: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 1000,
  });

  const rows = contacts
    .map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName || ""}`.trim(),
      email: c.email,
      phone: c.phone,
      stage: c.stage,
    }))
    .sort((a, b) => (a.phone ? 0 : 1) - (b.phone ? 0 : 1));

  const calls = await prisma.callLog.findMany({ where: { direction: "inbound" }, orderBy: { createdAt: "desc" }, take: 200 });
  const callerIds = [...new Set(calls.flatMap(c => c.contactId ? [c.contactId] : []))];
  const callers = await prisma.contact.findMany({ where: { id: { in: callerIds } }, select: { id: true, firstName: true, lastName: true } });
  const callerNames = new Map(callers.map(c => [c.id, `${c.firstName} ${c.lastName || ""}`.trim()]));

  return (
    <div>
      <PageHeader title="Dialer" description="Review incoming and missed calls, or dial a contact" />
      <section className="mb-6 rounded-xl border border-[#e4e4e7] bg-white p-4 sm:p-5" aria-label="Incoming call history">
        <h2 className="text-[16px] font-semibold mb-1">Incoming &amp; missed calls</h2>
        <p className="text-[12px] text-[#71717a] mb-4">Latest 200 incoming calls · updates every 30 seconds. Missed calls include calls sent to voicemail.</p>
        <CallsClient inboundOnly calls={calls.map(c => ({ ...c, contactName: c.contactId ? callerNames.get(c.contactId) || null : null, hasRecording: !!c.recordingSid, heard: !!c.heardAt, createdAt: c.createdAt.toISOString() }))} />
      </section>
      <DialerWorkspace contacts={rows} />
    </div>
  );
}
