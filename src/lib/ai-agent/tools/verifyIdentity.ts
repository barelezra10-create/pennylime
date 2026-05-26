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

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function pad2(n: number | string): string {
  return String(n).padStart(2, "0");
}

function expandYear(y: string): string {
  // 4 digits: pass through. 2 digits: assume DOB, so 30..99 -> 19xx, 00..29 -> 20xx.
  if (y.length === 4) return y;
  if (y.length === 2) {
    const n = parseInt(y, 10);
    return n >= 30 ? `19${y}` : `20${y}`;
  }
  return y;
}

export function normalizeDob(input: string): string {
  if (!input) return "";
  // Strip ordinal suffixes (1st, 2nd, 22nd, 3rd, 4th) anywhere.
  const cleaned = input.trim().toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/g, "$1");

  // ISO: 1990-04-12
  let m = cleaned.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

  // MM/DD/YYYY, M/D/YYYY, MM-DD-YYYY, also 2-digit year.
  m = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const year = expandYear(m[3]);
    return `${year}-${pad2(m[1])}-${pad2(m[2])}`;
  }

  // "June 16, 1979" or "Jul/17/1986" or "Jun-16-1986" — split on any separator.
  const tokens = cleaned.replace(/[,]+/g, " ").split(/[\s\/\-]+/).filter(Boolean);
  let monthName: number | null = null;
  let day: number | null = null;
  let year: string | null = null;
  for (const t of tokens) {
    if (monthName === null && MONTHS[t] !== undefined) {
      monthName = MONTHS[t];
    } else if (/^\d{1,2}$/.test(t) && day === null) {
      day = parseInt(t, 10);
    } else if (/^\d{2,4}$/.test(t) && year === null) {
      year = expandYear(t);
    }
  }
  if (monthName !== null && day !== null && year !== null && day >= 1 && day <= 31) {
    return `${year}-${pad2(monthName)}-${pad2(day)}`;
  }

  return cleaned;
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

    // If the previous lock has expired, treat the row as fresh so the user
    // doesn't get re-locked immediately by a stale attempts counter.
    const lockExpired = !!verif?.lockedUntil && verif.lockedUntil <= new Date();
    const priorAttempts = lockExpired ? 0 : (verif?.attempts ?? 0);
    const newAttempts = priorAttempts + (match ? 0 : 1);
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
