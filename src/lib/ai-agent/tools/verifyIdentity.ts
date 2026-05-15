import { prisma } from "@/lib/db";
import type { ToolDefinition } from "../types";

const MAX_ATTEMPTS = 3;
const LOCK_HOURS = 24;

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function normalizeDob(input: string): string {
  // Accept YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY → YYYY-MM-DD
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return trimmed;
}

export const verifyIdentity: ToolDefinition = {
  name: "verifyIdentity",
  description: "Verify the caller's identity using date of birth so account info can be shared. Provide dob as YYYY-MM-DD.",
  parameters: {
    type: "object",
    properties: { dob: { type: "string", description: "Date of birth, YYYY-MM-DD or MM/DD/YYYY" } },
    required: ["dob"],
  },
  requiredAuth: "anon",
  isWrite: false,
  handler: async (args, ctx) => {
    if (!ctx.contactId) {
      return { status: "ok", data: { verified: false, reason: "no_contact" } };
    }
    const verif = await prisma.agentVerification.findUnique({
      where: { contactId_channel: { contactId: ctx.contactId, channel: ctx.channel } },
    });
    if (verif?.lockedUntil && verif.lockedUntil > new Date()) {
      return { status: "ok", data: { verified: false, locked: true } };
    }
    const contact = await prisma.contact.findUnique({
      where: { id: ctx.contactId },
      include: { application: { select: { dateOfBirth: true } } },
    });
    const stored = contact?.application?.dateOfBirth ?? "";
    const input = normalizeDob(String(args.dob ?? ""));
    const match = stored.length > 0 && constantTimeEqual(stored, input);

    const newAttempts = (verif?.attempts ?? 0) + (match ? 0 : 1);
    const shouldLock = !match && newAttempts >= MAX_ATTEMPTS;
    await prisma.agentVerification.upsert({
      where: { contactId_channel: { contactId: ctx.contactId, channel: ctx.channel } },
      create: {
        contactId: ctx.contactId,
        channel: ctx.channel,
        attempts: newAttempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_HOURS * 3600_000) : null,
      },
      update: {
        attempts: match ? 0 : newAttempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_HOURS * 3600_000) : null,
        lastTriedAt: new Date(),
      },
    });
    return {
      status: "ok",
      data: { verified: match, locked: shouldLock },
      summary: match ? "identity verified" : shouldLock ? "verification locked" : "identity mismatch",
    };
  },
};
