import { prisma } from "@/lib/db";
import type { ToolDefinition } from "../types";
import { issueToken, verifyToken } from "../confirmation";

export const changeDueDate: ToolDefinition = {
  name: "changeDueDate",
  description: "Change the due date of the borrower's next unpaid payment. Call once without 'confirm' to get a token, then again with the token after the user says yes.",
  parameters: {
    type: "object",
    properties: {
      newDate: { type: "string", description: "New due date in YYYY-MM-DD" },
      confirm: { type: "string" },
    },
    required: ["newDate"],
  },
  requiredAuth: "verified",
  isWrite: true,
  handler: async (args, ctx) => {
    if (!ctx.contactId) return { status: "error", message: "no contact" };
    const newDate = String(args.newDate ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return { status: "error", message: "date must be YYYY-MM-DD" };

    const payload = { newDate };
    const confirm = typeof args.confirm === "string" ? args.confirm : undefined;
    if (!confirm) {
      return {
        status: "denied_confirm",
        needsConfirmation: true,
        summary: `Move your next payment due date to ${newDate}.`,
        token: issueToken(ctx.sessionId, "changeDueDate", payload),
      };
    }
    if (!verifyToken(confirm, ctx.sessionId, "changeDueDate", payload)) {
      return {
        status: "denied_confirm",
        needsConfirmation: true,
        summary: `Move next payment to ${newDate}.`,
        token: issueToken(ctx.sessionId, "changeDueDate", payload),
      };
    }

    const contact = await prisma.contact.findUnique({
      where: { id: ctx.contactId },
      include: { application: { select: { id: true, payments: { where: { paidAt: null }, orderBy: { dueDate: "asc" }, take: 1 } } } },
    });
    const next = contact?.application?.payments[0];
    if (!next) return { status: "error", message: "no unpaid payment" };
    await prisma.payment.update({
      where: { id: next.id },
      data: { dueDate: new Date(newDate + "T00:00:00Z") },
    });
    return { status: "ok", data: { changed: true, newDate }, summary: `moved due date to ${newDate}` };
  },
};
