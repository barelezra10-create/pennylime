import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
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

  return (
    <div>
      <PageHeader title="Dialer" description="Pick a contact or dial any number" />
      <DialerWorkspace contacts={rows} />
    </div>
  );
}
