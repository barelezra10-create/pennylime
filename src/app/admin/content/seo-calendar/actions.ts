"use server";

import { revalidatePath } from "next/cache";
import { planSeoMonth, generateArticleBody } from "@/lib/seo-calendar";
import { prisma } from "@/lib/db";

// Plan 3 articles per click — keeps each Gemini batch under the
// Cloudflare/Vercel edge timeout (~30-60s per topic generation).
const PLAN_CHUNK = 3;

export async function planSeoMonthAction(formData: FormData) {
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  await planSeoMonth({ year, month, chunk: PLAN_CHUNK });
  revalidatePath("/admin/content/seo-calendar");
}

export async function generateArticleAction(formData: FormData) {
  const articleId = String(formData.get("articleId"));
  await generateArticleBody(articleId);
  revalidatePath("/admin/content/seo-calendar");
}

export async function publishNowAction(formData: FormData) {
  const articleId = String(formData.get("articleId"));
  // Publish immediately (skip schedule). If body isn't generated yet,
  // try to generate first.
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { contentGenerated: true },
  });
  if (!article) return;
  if (!article.contentGenerated) {
    const r = await generateArticleBody(articleId);
    if (!r.ok) return;
  }
  await prisma.article.update({
    where: { id: articleId },
    data: { published: true, publishedAt: new Date() },
  });
  revalidatePath("/admin/content/seo-calendar");
}

export async function deletePlannedArticleAction(formData: FormData) {
  const articleId = String(formData.get("articleId"));
  // Only delete if it was scheduled-but-not-yet-published, to avoid
  // accidentally nuking a real published article.
  await prisma.article.deleteMany({
    where: { id: articleId, published: false, scheduledFor: { not: null } },
  });
  revalidatePath("/admin/content/seo-calendar");
}
