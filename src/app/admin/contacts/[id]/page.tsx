import { getContact } from "@/actions/contacts";
import { getTeamMembers } from "@/actions/team";
import { ContactDetailClient } from "./contact-detail-client";
import { notFound } from "next/navigation";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [contact, team] = await Promise.all([getContact(id), getTeamMembers()]);
  if (!contact) notFound();

  return (
    <ContactDetailClient
      contact={{
        ...contact,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
        tags: contact.tags.map((t) => t.tag),
        activities: contact.activities.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
        })),
        application: contact.application ? {
          id: contact.application.id,
          applicationCode: contact.application.applicationCode,
          status: contact.application.status,
          loanAmount: Number(contact.application.loanAmount),
          createdAt: contact.application.createdAt.toISOString(),
        } : null,
      }}
      team={team}
    />
  );
}
