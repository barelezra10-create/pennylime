import { prisma } from "@/lib/db";
import { sendSms } from "@/lib/sms/twilio";
import type { ToolDefinition } from "../types";

export const sendMagicLink: ToolDefinition = {
  name: "sendMagicLink",
  description: "Send the borrower a link to their public status page via SMS. Use when the user wants to view details we cannot speak/text in full.",
  parameters: {
    type: "object",
    properties: { channel: { type: "string", description: "'sms' (only option for now)" } },
  },
  requiredAuth: "anon",
  isWrite: false,
  handler: async (_args, ctx) => {
    if (!ctx.contactId) return { status: "error", message: "no contact" };
    const c = await prisma.contact.findUnique({
      where: { id: ctx.contactId },
      include: { application: { select: { applicationCode: true } } },
    });
    if (!c?.phone || !c.application) return { status: "error", message: "missing phone or application" };
    const url = `https://pennylime.com/status?code=${c.application.applicationCode}`;
    const result = await sendSms({
      to: c.phone,
      body: `Your PennyLime status: ${url}`,
      contactId: ctx.contactId,
    });
    if (!result.ok) return { status: "error", message: result.error };
    return { status: "ok", data: { sent: true }, summary: "sent status link via SMS" };
  },
};
