import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { generateArticleBody } from "@/lib/seo-calendar";

/**
 * Bulk-regenerate AI articles' bodies + hero images. One call
 * processes up to `limit` articles (default 1) to stay under
 * serverless timeouts — call repeatedly to drain the queue.
 *
 * Targets: every article with contentGenerated=true. Re-runs the
 * whole AI body + hero image pipeline so older articles match the
 * latest prompt + style updates.
 *
 * Body (optional JSON): { limit: number }
 * Returns: { processed: number, remaining: number, results: [...] }
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  let body: { limit?: number } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }
  const limit = Math.max(1, Math.min(3, body.limit ?? 1));

  // Target articles that need regeneration. Two cases:
  //   (a) contentGenerated=true — articles previously generated with
  //       an older prompt/style that should be refreshed.
  //   (b) published=true AND featuredImage IS NULL — articles whose
  //       last generation failed mid-way (body saved but image
  //       upload errored), leaving them visible-but-incomplete.
  // Both cases get the full body + hero regenerated.
  const needsRegen = {
    OR: [
      { contentGenerated: true },
      { AND: [{ published: true }, { featuredImage: null }] },
    ],
  };
  const articles = await prisma.article.findMany({
    where: needsRegen,
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true, slug: true },
  });
  const total = await prisma.article.count({ where: needsRegen });

  const results: Array<{ slug: string; ok: boolean; error?: string; wordCount?: number }> = [];
  for (const a of articles) {
    // Mark contentGenerated=false so generateArticleBody runs cleanly.
    await prisma.article.update({
      where: { id: a.id },
      data: { contentGenerated: false },
    });
    const r = await generateArticleBody(a.id);
    if (r.ok) {
      results.push({ slug: a.slug, ok: true, wordCount: r.wordCount });
    } else {
      results.push({ slug: a.slug, ok: false, error: r.error });
    }
  }

  return NextResponse.json({
    processed: results.length,
    remaining: total - results.length,
    totalAiArticles: total,
    results,
  });
}
