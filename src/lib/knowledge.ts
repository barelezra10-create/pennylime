import "server-only";
import { prisma } from "@/lib/db";

export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same question when normalized forms are equal, or one contains the other (both non-trivial). */
export function questionsMatch(a: string, b: string): boolean {
  const na = normalizeQuestion(a);
  const nb = normalizeQuestion(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return shorter.length >= 8 && longer.includes(shorter);
}

/**
 * Files a question the AI could not answer. Dedupes into an existing
 * PENDING entry when the question matches; attaches the session as a
 * waiter either way. Returns the entry id.
 */
export async function recordOwnerQuestion(sessionId: string, question: string): Promise<string> {
  const q = question.trim().slice(0, 500);
  const pending = await prisma.knowledgeEntry.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, question: true },
  });
  const match = pending.find((p) => questionsMatch(p.question, q));
  const entryId = match
    ? match.id
    : (await prisma.knowledgeEntry.create({ data: { question: q }, select: { id: true } })).id;

  await prisma.knowledgeWaiter.upsert({
    where: { entryId_sessionId: { entryId, sessionId } },
    create: { entryId, sessionId },
    update: {},
  });
  return entryId;
}

/** ANSWERED entries for the system prompt, newest first, capped. */
export async function getAnsweredKnowledge(limit = 50): Promise<Array<{ question: string; answer: string }>> {
  const rows = await prisma.knowledgeEntry.findMany({
    where: { status: "ANSWERED", answer: { not: null } },
    orderBy: { answeredAt: "desc" },
    take: limit,
    select: { question: true, answer: true },
  });
  return rows.map((r) => ({ question: r.question, answer: r.answer as string }));
}
