"use server";

import { prisma } from "@/lib/db";

export type PipelineRecord = {
  id: string;
  applicationId: string | null;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  stage: string;
  assignedRepName: string | null;
  requestedAmount: number | null;
  advanceStatus: string | null;
  outstanding: number;
  nextDueDate: string | null;
  nextDueAmount: number;
  updatedAt: string;
};

// Stages that are post-funding — show outstanding balance instead of requested amount.
const FUNDED_STAGES = new Set(["FUNDED", "REPAYING", "LATE", "PAID_OFF", "DEFAULTED"]);

export async function getPipelineRecords(): Promise<PipelineRecord[]> {
  const contacts = await prisma.contact.findMany({
    where: { archivedAt: null },
    include: {
      assignedRep: { select: { id: true, name: true } },
      application: {
        include: {
          payments: {
            orderBy: { paymentNumber: "asc" },
            select: {
              id: true,
              amount: true,
              lateFee: true,
              dueDate: true,
              paidAt: true,
              status: true,
              paymentNumber: true,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return contacts.map((c) => {
    const app = c.application ?? null;
    const payments = app?.payments ?? [];

    // Outstanding = sum of (amount + lateFee) for all unpaid payments
    const unpaidPayments = payments.filter(
      (p) => !p.paidAt && p.status !== "PAID" && p.status !== "CANCELLED",
    );
    const outstanding = unpaidPayments.reduce((sum, p) => {
      return sum + Number(p.amount.toString()) + Number(p.lateFee.toString());
    }, 0);

    // Next due payment = first unpaid, sorted by dueDate ascending
    const sortedUnpaid = [...unpaidPayments].sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );
    const nextPayment = sortedUnpaid[0] ?? null;

    return {
      id: c.id,
      applicationId: c.applicationId ?? null,
      firstName: c.firstName,
      lastName: c.lastName ?? null,
      email: c.email,
      phone: c.phone ?? null,
      stage: c.stage,
      assignedRepName: c.assignedRep?.name ?? null,
      requestedAmount: app ? Number(app.loanAmount.toString()) : null,
      advanceStatus: app?.status ?? null,
      outstanding,
      nextDueDate: nextPayment ? nextPayment.dueDate.toISOString() : null,
      nextDueAmount: nextPayment
        ? Number(nextPayment.amount.toString()) + Number(nextPayment.lateFee.toString())
        : 0,
      updatedAt: c.updatedAt.toISOString(),
    };
  });
}
