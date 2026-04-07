import { getContacts } from "@/actions/contacts";
import { AbandonedClient } from "./abandoned-client";

export default async function AbandonedPage() {
  const { contacts, total } = await getContacts({ tag: "abandoned-app" });

  // Compute step dropout stats
  const stepCounts: Record<number, number> = {};
  for (const c of contacts) {
    const step = c.lastAppStep || 0;
    stepCounts[step] = (stepCounts[step] || 0) + 1;
  }

  // This week's count
  const thisWeek = contacts.filter(
    (c) => c.createdAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  ).length;

  return (
    <AbandonedClient
      contacts={contacts.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        lastAppStep: c.lastAppStep,
        source: c.source,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        assignedRep: c.assignedRep,
        tags: c.tags.map((t) => t.tag),
      }))}
      total={total}
      stats={{ thisWeek, stepCounts, total }}
    />
  );
}
