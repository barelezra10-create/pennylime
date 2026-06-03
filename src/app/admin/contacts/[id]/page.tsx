import { getContact } from "@/actions/contacts";
import { getTeamMembers } from "@/actions/team";
import { ContactDetailClient } from "./contact-detail-client";
import { notFound } from "next/navigation";
import { computeLoanSummary } from "@/lib/loan-summary";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [contact, team] = await Promise.all([getContact(id), getTeamMembers()]);
  if (!contact) notFound();

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
        application: contact.application
          ? {
              id: contact.application.id,
              applicationCode: contact.application.applicationCode,
              status: contact.application.status,
              offerStatus: contact.application.offerStatus,
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
              documents: contact.application.documents.map((d) => ({
                id: d.id,
                fileName: d.fileName,
                mimeType: d.mimeType,
                fileSize: d.fileSize,
                storagePath: d.storagePath,
                documentType: d.documentType,
                createdAt: d.createdAt.toISOString(),
              })),
            }
          : null,
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
