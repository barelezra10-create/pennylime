import { prisma } from "@/lib/db";
import type { ToolDefinition } from "../types";

export const getLoanSummary: ToolDefinition = {
  name: "getLoanSummary",
  description: "Get the verified borrower's loan summary: remaining balance, next payment, APR, payoff.",
  parameters: { type: "object", properties: {} },
  requiredAuth: "verified",
  isWrite: false,
  handler: async (_args, ctx) => {
    if (!ctx.contactId) return { status: "error", message: "no contact in context" };
    const contact = await prisma.contact.findUnique({
      where: { id: ctx.contactId },
      include: {
        application: {
          select: {
            applicationCode: true,
            acceptedAmount: true,
            interestRate: true,
            payments: { select: { dueDate: true, amount: true, paidAt: true, status: true }, orderBy: { dueDate: "asc" } },
          },
        },
      },
    });
    const app = contact?.application;
    if (!app) return { status: "ok", data: { found: false } };

    const unpaid = app.payments.filter((p) => !p.paidAt);
    const remaining = unpaid.reduce((sum, p) => sum + Number(p.amount), 0);
    const next = unpaid[0];
    return {
      status: "ok",
      data: {
        found: true,
        applicationCode: app.applicationCode,
        remainingBalance: remaining,
        nextPaymentAmount: next ? Number(next.amount) : 0,
        nextPaymentDate: next ? next.dueDate.toISOString().slice(0, 10) : null,
        aprPercent: app.interestRate ? Number(app.interestRate) * 100 : null,
        payoffAmount: remaining,
      },
      summary: `balance $${remaining.toFixed(2)}, next due ${next?.dueDate.toISOString().slice(0, 10) ?? "none"}`,
    };
  },
};
