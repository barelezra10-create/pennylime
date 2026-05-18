import { prisma } from "@/lib/db";
import type { ToolDefinition } from "../types";

export const getPaymentHistory: ToolDefinition = {
  name: "getPaymentHistory",
  description: "Return the most recent payments on the verified borrower's advance.",
  parameters: {
    type: "object",
    properties: { limit: { type: "number", description: "Max payments to return (default 5)" } },
  },
  requiredAuth: "verified",
  isWrite: false,
  handler: async (args, ctx) => {
    if (!ctx.contactId) return { status: "error", message: "no contact in context" };
    const limit = Math.min(Math.max(Number(args.limit ?? 5), 1), 25);
    const contact = await prisma.contact.findUnique({
      where: { id: ctx.contactId },
      include: { application: { select: { payments: { orderBy: { dueDate: "desc" } } } } },
    });
    const payments = (contact?.application?.payments ?? []).slice(0, limit).map((p) => ({
      dueDate: p.dueDate.toISOString().slice(0, 10),
      amount: Number(p.amount),
      paid: !!p.paidAt,
      status: p.status,
    }));
    return { status: "ok", data: { payments }, summary: `returned ${payments.length} payments` };
  },
};
