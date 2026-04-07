import { getContacts, getContactMetrics } from "@/actions/contacts";
import { getTeamMembers } from "@/actions/team";
import { ContactsClient } from "./contacts-client";

export default async function ContactsPage() {
  const [{ contacts, total }, metrics, team] = await Promise.all([
    getContacts(),
    getContactMetrics(),
    getTeamMembers(),
  ]);

  return (
    <ContactsClient
      contacts={contacts.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        tags: c.tags.map((t) => t.tag),
      }))}
      total={total}
      metrics={metrics}
      team={team}
    />
  );
}
