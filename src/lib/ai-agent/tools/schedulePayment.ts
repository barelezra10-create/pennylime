import { prisma } from "@/lib/db";
import type { ToolDefinition } from "../types";
import { issueToken, verifyToken } from "../confirmation";

export const schedulePayment: ToolDefinition = {
  name: "schedulePayment",
  description: "Schedule a one-time ACH payment for the verified borrower. Call once without 'confirm' to get a confirmation summary, then call again with the returned 'confirm' token after the user says yes.",
  parameters: {
    type: "object",
    properties: {
      amount: { type: "number" },
      date: { type: "string", description: "Date in YYYY-MM-DD" },
      confirm: { type: "string", description: "Confirmation token returned on the first call" },
    },
    required: ["amount", "date"],
  },
  requiredAuth: "verified",
  isWrite: true,
  handler: async (args, ctx) => {
    if (!ctx.contactId) return { status: "error", message: "no contact" };
    const amount = Number(args.amount);
    const date = String(args.date ?? "");
    if (!Number.isFinite(amount) || amount <= 0) return { status: "error", message: "invalid amount" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { status: "error", message: "date must be YYYY-MM-DD" };

    const payload = { amount, date };
    const confirm = typeof args.confirm === "string" ? args.confirm : undefined;
    if (!confirm) {
      const token = issueToken(ctx.sessionId, "schedulePayment", payload);
      return {
        status: "denied_confirm",
        needsConfirmation: true,
        summary: `Schedule a $${amount.toFixed(2)} payment on ${date}.`,
        token,
      };
    }
    if (!verifyToken(confirm, ctx.sessionId, "schedulePayment", payload)) {
      return { status: "denied_confirm", needsConfirmation: true, summary: `Confirm $${amount.toFixed(2)} on ${date}.`, token: issueToken(ctx.sessionId, "schedulePayment", payload) };
    }

    const contact = await prisma.contact.findUnique({
      where: { id: ctx.contactId },
      include: { application: { select: { id: true, payments: { orderBy: { paymentNumber: "desc" }, take: 1 } } } },
    });
    if (!contact?.application) return { status: "error", message: "no application" };

    const nextNumber = (contact.application.payments[0]?.paymentNumber ?? 0) + 1;
    await prisma.payment.create({
      data: {
        applicationId: contact.application.id,
        amount,
        principal: amount,
        interest: 0,
        dueDate: new Date(date + "T00:00:00Z"),
        status: "PENDING",
        paymentNumber: nextNumber,
      },
    });
    return { status: "ok", data: { scheduled: true, amount, date }, summary: `scheduled $${amount.toFixed(2)} on ${date}` };
  },
};
