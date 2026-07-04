import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { CallsClient } from "./calls-client";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const calls = await prisma.callLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const contactIds = [...new Set(calls.map((c) => c.contactId).filter((x): x is string => !!x))];
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameById = new Map(contacts.map((c) => [c.id, `${c.firstName} ${c.lastName || ""}`.trim()]));

  return (
    <div>
      <PageHeader title="Calls" description="Outbound calls and inbound voicemails" />
      <CallsClient
        calls={calls.map((c) => ({
          id: c.id,
          contactId: c.contactId,
          contactName: c.contactId ? nameById.get(c.contactId) || null : null,
          direction: c.direction,
          kind: c.kind,
          fromNumber: c.fromNumber,
          toNumber: c.toNumber,
          status: c.status,
          outcome: c.outcome,
          notes: c.notes,
          durationSec: c.durationSec,
          hasRecording: !!c.recordingSid,
          transcription: c.transcription,
          heard: !!c.heardAt,
          agentEmail: c.agentEmail,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
