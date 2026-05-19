/**
 * SEO content calendar. Plans + auto-generates a month's worth of
 * blog articles, scheduled every other day (~15/month).
 *
 * Pipeline:
 *   1. planSeoMonth(year, month, chunk) — for "every other day" slots
 *      in the month that don't already have a planned article, calls
 *      Gemini to pick a unique, keyword-rich topic + slug, then
 *      creates a DRAFT Article row with scheduledFor set and a
 *      placeholder body. Runs chunk-at-a-time so a single click
 *      doesn't exceed serverless timeouts.
 *   2. generateArticleBody(articleId) — fills the body of a planned
 *      article via Gemini (1,500+ word SEO-optimized markdown with
 *      internal links to /cash-advance/<slug> pages).
 *   3. publishScheduledArticles() — daily cron: any draft Article
 *      with scheduledFor <= now AND contentGenerated=true gets
 *      flipped to published.
 */

import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/db";

// gemini-2.5-flash-lite is the model Bar's key has full access to —
// gemini-2.5-flash 403s on his account. Match the model already used
// by the bank-statement parser (proven working).
const TOPIC_MODEL = process.env.GEMINI_SEO_MODEL || "gemini-2.5-flash-lite";
const CONTENT_MODEL = process.env.GEMINI_SEO_CONTENT_MODEL || "gemini-2.5-flash-lite";

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  client = new GoogleGenAI({ apiKey });
  return client;
}

/**
 * Returns every-other-day dates for the given month (UTC). Skips dates
 * before today so we don't schedule into the past.
 */
export function getEveryOtherDayDates(year: number, month: number): Date[] {
  // month is 1-12 (calendar)
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates: Date[] = [];
  // Start day 1, then every 2nd day (1, 3, 5, …)
  for (let d = 1; d <= daysInMonth; d += 2) {
    const date = new Date(Date.UTC(year, month - 1, d, 14, 0, 0)); // publish 14:00 UTC = 9-10am ET
    if (date >= today) dates.push(date);
  }
  return dates;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function stripCodeFences(s: string): string {
  return s.replace(/^```(?:json|markdown|md)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

type PlannedTopic = {
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  // Tag the topic so we can vary angle (how-to, comparison, listicle, …)
  angle: string;
};

const TOPIC_SYSTEM_PROMPT = `You are an SEO content strategist for PennyLime, a cash-advance product for US gig workers.

Your job: propose ONE blog article topic that's SEO-rich, useful, and not duplicative of any topic in the EXISTING_SLUGS list passed in. Topics should target keywords gig workers actually search for and should naturally encourage them to consider a cash advance.

Audience: Uber, Lyft, DoorDash, Amazon Flex, Instacart, Grubhub, Walmart Spark, OnlyFans, Twitch, YouTube, Etsy, eBay, freelancers — anyone earning gig/1099 income in the US.

Topic angles to rotate through (pick whichever fits best):
- How-to ("How to ___ as a [platform] driver")
- Comparison ("X vs Y for [worker type]")
- Listicle ("7 best [thing] for [worker type]")
- Trend / news ("What [platform] drivers need to know about [recent change]")
- FAQ-style ("Do [worker type] need to file 1099-K?")
- Income / earnings ("How much can you make on [platform] in [city]")
- Tax / financial ("Quarterly tax deadlines for gig workers in [year]")

Quality rules:
- The slug must be unique (not in EXISTING_SLUGS).
- Title is 50-65 chars (Google's SERP cutoff).
- metaTitle ≤ 60 chars. metaDescription 140-155 chars.
- excerpt: 1 sentence, ~140 chars, hooks the click.
- Avoid duplicate topics. If user just published one about DoorDash, don't pick DoorDash again unless angle is clearly different.

Return STRICT JSON, no markdown fences:
{
  "title": "...",
  "slug": "...",
  "metaTitle": "...",
  "metaDescription": "...",
  "excerpt": "...",
  "angle": "how-to" | "comparison" | "listicle" | "trend" | "faq" | "income" | "tax"
}`;

async function generateOneTopic(existingSlugs: string[]): Promise<PlannedTopic> {
  const ai = getClient();
  const r = await ai.models.generateContent({
    model: TOPIC_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: TOPIC_SYSTEM_PROMPT },
          { text: `EXISTING_SLUGS:\n${existingSlugs.slice(0, 200).join("\n")}\n\nGenerate one topic now.` },
        ],
      },
    ],
    config: { temperature: 0.9, responseMimeType: "application/json" },
  });
  const raw = stripCodeFences(r.text ?? "");
  const parsed = JSON.parse(raw) as PlannedTopic;
  if (!parsed.title || !parsed.slug) throw new Error("Topic missing title/slug");
  // Re-slugify to guarantee URL safety + uniqueness
  parsed.slug = slugify(parsed.slug || parsed.title);
  return parsed;
}

/**
 * Plans up to `chunk` articles in the given month. Idempotent: skips
 * dates that already have a scheduled Article. Returns the list of
 * Articles newly created.
 */
export async function planSeoMonth(input: {
  year: number;
  month: number; // 1-12
  chunk: number;
}): Promise<{ created: number; skipped: number }> {
  const allDates = getEveryOtherDayDates(input.year, input.month);

  // Which of those dates already have an article scheduled?
  const start = new Date(Date.UTC(input.year, input.month - 1, 1));
  const end = new Date(Date.UTC(input.year, input.month, 1));
  const existing = await prisma.article.findMany({
    where: { scheduledFor: { gte: start, lt: end } },
    select: { scheduledFor: true },
  });
  const filledDays = new Set(
    existing
      .map((a) => a.scheduledFor?.toISOString().slice(0, 10))
      .filter(Boolean) as string[],
  );

  const openDates = allDates.filter(
    (d) => !filledDays.has(d.toISOString().slice(0, 10)),
  );
  if (openDates.length === 0) return { created: 0, skipped: 0 };

  // Get all existing slugs (across the whole DB, not just this month)
  // so the topic generator can avoid duplicates.
  const allSlugs = (
    await prisma.article.findMany({ select: { slug: true } })
  ).map((a) => a.slug);

  const toPlan = openDates.slice(0, input.chunk);
  let created = 0;
  let skipped = 0;
  for (const date of toPlan) {
    try {
      const topic = await generateOneTopic([...allSlugs]);
      // De-dupe: if Gemini picked a slug we already have, fall through.
      if (allSlugs.includes(topic.slug)) {
        topic.slug = `${topic.slug}-${date.toISOString().slice(0, 10)}`;
      }
      await prisma.article.create({
        data: {
          title: topic.title,
          slug: topic.slug,
          metaTitle: topic.metaTitle,
          metaDescription: topic.metaDescription,
          excerpt: topic.excerpt,
          body: `<!-- ${topic.angle} -->\n\nDraft to be generated. Topic angle: ${topic.angle}.\n`,
          scheduledFor: date,
          published: false,
          contentGenerated: false,
        },
      });
      allSlugs.push(topic.slug);
      created++;
    } catch (err) {
      console.error("[seo-calendar] topic generation failed:", err);
      skipped++;
    }
  }
  return { created, skipped };
}

const CONTENT_SYSTEM_PROMPT = `You are a senior SEO content writer for PennyLime, a cash-advance product for US gig workers.

Write a complete blog article in MARKDOWN. Requirements:

- 1,500 to 2,200 words.
- Opens with a hook + brief overview of what the reader will learn.
- Uses H2 and H3 subheadings to break up content (good for skim + featured snippets).
- Includes at least one TABLE comparing options/numbers where it fits.
- Includes a numbered LIST or bullet list for at least one section.
- Concrete, useful information. No fluff. Cite typical earnings, real timelines, real numbers.
- Tone: direct, practical, helpful. NOT corporate. NOT salesy.
- NEVER use em dashes (—). Use commas, parentheses, or sentence breaks instead.
- Naturally weave 2-3 internal links to PennyLime cash-advance pages where relevant:
    [link text](/cash-advance) (hub)
    [link text](/cash-advance/uber-drivers)
    [link text](/cash-advance/doordash-dashers)
    [link text](/cash-advance/amazon-flex-drivers)
    [link text](/cash-advance/instacart-shoppers)
    [link text](/cash-advance/grubhub-drivers)
    [link text](/cash-advance/lyft-drivers)
    [link text](/cash-advance/onlyfans-creators)
    [link text](/cash-advance/etsy-sellers)
    [link text](/cash-advance/twitch-streamers)
  Use only the slugs above; don't invent new ones.
- Ends with a FAQ section: 4-5 questions, H3 for each question, short answer paragraphs.
- Ends with a brief CTA paragraph encouraging the reader to apply at /apply.

Output: markdown only, no preamble or "Here is the article:" text. Start with the first paragraph of body (the H1 / title is set elsewhere — don't include it).`;

/**
 * Fills in the body for one already-planned Article via Gemini.
 * Marks contentGenerated=true on success.
 */
export async function generateArticleBody(articleId: string): Promise<{ ok: true; wordCount: number } | { ok: false; error: string }> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true, title: true, slug: true, excerpt: true, contentGenerated: true },
  });
  if (!article) return { ok: false, error: "Article not found" };

  try {
    const ai = getClient();
    const r = await ai.models.generateContent({
      model: CONTENT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: CONTENT_SYSTEM_PROMPT },
            {
              text: `TITLE: ${article.title}\nSLUG: ${article.slug}\nEXCERPT: ${article.excerpt ?? "(none)"}\n\nWrite the article body now.`,
            },
          ],
        },
      ],
      config: { temperature: 0.7 },
    });
    const body = (r.text ?? "").trim();
    if (!body || body.length < 800) {
      return { ok: false, error: "Generated body is too short — try again" };
    }
    await prisma.article.update({
      where: { id: articleId },
      data: { body, contentGenerated: true },
    });
    return { ok: true, wordCount: body.split(/\s+/).length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Generation failed" };
  }
}

/**
 * Publishes any article whose scheduledFor <= now AND contentGenerated.
 * Called from a daily cron. Returns the count published.
 */
export async function publishScheduledArticles(): Promise<{ published: number; pendingGeneration: number }> {
  const now = new Date();
  // Find articles past their scheduledFor.
  const due = await prisma.article.findMany({
    where: {
      scheduledFor: { lte: now },
      published: false,
    },
    select: { id: true, contentGenerated: true },
  });

  let published = 0;
  let pendingGeneration = 0;
  for (const article of due) {
    if (!article.contentGenerated) {
      // Auto-generate body now so the publish can succeed.
      const r = await generateArticleBody(article.id);
      if (!r.ok) {
        pendingGeneration++;
        continue;
      }
    }
    await prisma.article.update({
      where: { id: article.id },
      data: { published: true, publishedAt: new Date() },
    });
    published++;
  }
  return { published, pendingGeneration };
}
