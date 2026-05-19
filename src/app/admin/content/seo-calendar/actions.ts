"use server";

import { revalidatePath } from "next/cache";
import { planSeoMonth, generateArticleBody } from "@/lib/seo-calendar";
import { prisma } from "@/lib/db";

// One article per click since each click now ALSO generates the body
// (~30s), not just the topic. Click multiple times to fill more slots.
const PLAN_CHUNK = 1;

export async function planSeoMonthAction(year: number, month: number) {
  try {
    const r = await planSeoMonth({ year, month, chunk: PLAN_CHUNK });
    revalidatePath("/admin/content/seo-calendar");
    return { ok: true as const, ...r };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Planning failed" };
  }
}

export async function generateArticleAction(articleId: string) {
  const r = await generateArticleBody(articleId);
  if (r.ok) {
    revalidatePath("/admin/content/seo-calendar");
    return { ok: true as const, wordCount: r.wordCount };
  }
  return { ok: false as const, error: r.error };
}

export async function publishNowAction(articleId: string) {
  try {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { contentGenerated: true },
    });
    if (!article) return { ok: false as const, error: "Article not found" };
    if (!article.contentGenerated) {
      const r = await generateArticleBody(articleId);
      if (!r.ok) return { ok: false as const, error: r.error };
    }
    await prisma.article.update({
      where: { id: articleId },
      data: { published: true, publishedAt: new Date() },
    });
    revalidatePath("/admin/content/seo-calendar");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Publish failed" };
  }
}

export async function deletePlannedArticleAction(articleId: string) {
  try {
    await prisma.article.deleteMany({
      where: { id: articleId, published: false, scheduledFor: { not: null } },
    });
    revalidatePath("/admin/content/seo-calendar");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Delete failed" };
  }
}
