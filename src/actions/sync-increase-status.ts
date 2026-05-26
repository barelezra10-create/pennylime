"use server";

import { prisma } from "@/lib/db";
import { getAchTransfer } from "@/lib/increase";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Snapshot of every Increase ACH transfer attached to one application:
 *   - the disbursement credit (the funding wire that went OUT)
 *   - every weekly debit (the repayments that come IN)
 * Each row carries the latest status pulled from Increase. The DB row
 * is also updated so subsequent renders don't need a fresh fetch.
 */
export type IncreaseTransferRow = {
  kind: "disbursement" | "repayment";
  paymentNumber?: number;
  dueDate?: string | null;
  paidAt?: string | null;
  amount: number;
  transferId: string;
  status: string;
  fetchedFromIncrease: boolean;
  error?: string | null;
};

export type IncreaseSyncResult = {
  ok: true;
  rows: IncreaseTransferRow[];
} | {
  ok: false;
  error: string;
};

export async function syncIncreaseForApplication(applicationId: string): Promise<IncreaseSyncResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Not authenticated" };

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      increaseTransferId: true,
      increaseTransferStatus: true,
      fundedAmount: true,
      loanAmount: true,
      payments: {
        orderBy: { paymentNumber: "asc" },
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          dueDate: true,
          paidAt: true,
          status: true,
          increaseTransferId: true,
          increaseTransferStatus: true,
        },
      },
    },
  });

  if (!app) return { ok: false, error: "Application not found" };

  const rows: IncreaseTransferRow[] = [];

  // Disbursement (the credit we sent out)
  if (app.increaseTransferId) {
    const transferId = app.increaseTransferId;
    const res = await getAchTransfer(transferId);
    if (res.ok) {
      rows.push({
        kind: "disbursement",
        amount: Number(app.fundedAmount ?? app.loanAmount),
        transferId,
        status: res.data.status,
        fetchedFromIncrease: true,
      });
      // Persist the latest status if it changed
      if (res.data.status !== app.increaseTransferStatus) {
        await prisma.application.update({
          where: { id: app.id },
          data: { increaseTransferStatus: res.data.status },
        });
      }
    } else {
      rows.push({
        kind: "disbursement",
        amount: Number(app.fundedAmount ?? app.loanAmount),
        transferId,
        status: app.increaseTransferStatus || "unknown",
        fetchedFromIncrease: false,
        error: res.error,
      });
    }
  }

  // Repayments — each debit
  for (const p of app.payments) {
    if (!p.increaseTransferId) {
      // No transfer attempted yet — surface as a row anyway so admins
      // see the full schedule in one view.
      rows.push({
        kind: "repayment",
        paymentNumber: p.paymentNumber,
        dueDate: p.dueDate.toISOString(),
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        amount: Number(p.amount),
        transferId: "",
        status: p.status,
        fetchedFromIncrease: false,
      });
      continue;
    }
    const transferId = p.increaseTransferId;
    const res = await getAchTransfer(transferId);
    if (res.ok) {
      rows.push({
        kind: "repayment",
        paymentNumber: p.paymentNumber,
        dueDate: p.dueDate.toISOString(),
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        amount: Number(p.amount),
        transferId,
        status: res.data.status,
        fetchedFromIncrease: true,
      });
      if (res.data.status !== p.increaseTransferStatus) {
        await prisma.payment.update({
          where: { id: p.id },
          data: { increaseTransferStatus: res.data.status },
        });
      }
    } else {
      rows.push({
        kind: "repayment",
        paymentNumber: p.paymentNumber,
        dueDate: p.dueDate.toISOString(),
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        amount: Number(p.amount),
        transferId,
        status: p.increaseTransferStatus || p.status,
        fetchedFromIncrease: false,
        error: res.error,
      });
    }
  }

  return { ok: true, rows };
}
