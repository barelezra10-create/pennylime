import { getContact } from "@/actions/contacts";
import { getTeamMembers } from "@/actions/team";
import { ContactDetailClient } from "./contact-detail-client";
import { notFound, redirect } from "next/navigation";
import { computeLoanSummary } from "@/lib/loan-summary";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [contact, team] = await Promise.all([getContact(id), getTeamMembers()]);
  if (!contact) notFound();

  // Contacts with a linked application live on the merged application
  // view now — one scrolling page with CRM + SMS + email + Plaid.
  // Leads without an application keep the classic contact view.
  if (contact.application) {
    redirect(`/admin/applications/${contact.application.id}`);
  }

  const loan = computeLoanSummary(contact.application as unknown as Parameters<typeof computeLoanSummary>[0]);

  return (
    <ContactDetailClient
      contact={{
        ...contact,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
        archivedAt: contact.archivedAt ? contact.archivedAt.toISOString() : null,
        tags: contact.tags.map((t) => t.tag),
        activities: contact.activities.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
        })),
        // Always null here — contacts with a linked application were
        // redirected to the merged application view above.
        application: null,
        otherApplications: ((contact as any).otherApplications ?? []).map((a: any) => ({
          id: a.id,
          applicationCode: a.applicationCode,
          status: a.status,
          loanAmount: Number(a.loanAmount),
          fundedAmount: a.fundedAmount != null ? Number(a.fundedAmount) : null,
          fundedAt: a.fundedAt ? new Date(a.fundedAt).toISOString() : null,
          createdAt: new Date(a.createdAt).toISOString(),
          rejectionReason: a.rejectionReason ?? null,
          payments: a.payments.map((p: any) => ({
            paymentNumber: p.paymentNumber,
            amount: Number(p.amount),
            principal: Number(p.principal),
            status: p.status,
            dueDate: p.dueDate ? new Date(p.dueDate).toISOString() : null,
            paidAt: p.paidAt ? new Date(p.paidAt).toISOString() : null,
          })),
        })),
        loan,
      }}
      team={team}
    />
  );
}
