import { getContacts, getContactMetrics } from "@/actions/contacts";
import { getTeamMembers } from "@/actions/team";
import { ContactsClient } from "./contacts-client";
import { computeLoanSummary } from "@/lib/loan-summary";

export default async function ContactsPage() {
  const [{ contacts, total }, metrics, team] = await Promise.all([
    getContacts(),
    getContactMetrics(),
    getTeamMembers(),
  ]);

  return (
    <ContactsClient
      contacts={contacts.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        stage: c.stage,
        source: c.source,
        loanAmountIntent: c.loanAmountIntent != null ? Number(c.loanAmountIntent) : null,
        landingPage: c.landingPage,
        referrer: c.referrer,
        utmCampaign: c.utmCampaign,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        tags: c.tags.map((t) => t.tag),
        assignedRep: c.assignedRep,
        loan: computeLoanSummary(c.application as Parameters<typeof computeLoanSummary>[0]),
      }))}
      total={total}
      metrics={metrics}
      team={team}
    />
  );
}
