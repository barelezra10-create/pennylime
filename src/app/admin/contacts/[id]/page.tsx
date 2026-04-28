import { getContact } from "@/actions/contacts";
import { getTeamMembers } from "@/actions/team";
import { ContactDetailClient } from "./contact-detail-client";
import { notFound } from "next/navigation";
import { computeLoanSummary } from "@/lib/loan-summary";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [contact, team] = await Promise.all([getContact(id), getTeamMembers()]);
  if (!contact) notFound();

  const loan = computeLoanSummary(contact.application as Parameters<typeof computeLoanSummary>[0]);

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
        application: contact.application
          ? {
              id: contact.application.id,
              applicationCode: contact.application.applicationCode,
              status: contact.application.status,
              loanAmount: Number(contact.application.loanAmount),
              createdAt: contact.application.createdAt.toISOString(),
              payments: contact.application.payments.map((p) => ({
                id: p.id,
                paymentNumber: p.paymentNumber,
                amount: Number(p.amount),
                principal: Number(p.principal),
                interest: Number(p.interest),
                lateFee: Number(p.lateFee),
                dueDate: p.dueDate.toISOString(),
                paidAt: p.paidAt ? p.paidAt.toISOString() : null,
                status: p.status,
              })),
            }
          : null,
        loan,
      }}
      team={team}
    />
  );
}
