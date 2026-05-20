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
 * Plans up to `chunk` articles in the given month AND writes the
 * body for each in the same call, so what comes back is fully
 * publish-ready. Idempotent: skips dates that already have a
 * scheduled Article.
 *
 * Why combined: planning a topic alone is fast (~5s) but doesn't
 * give the admin anything useful — they'd still need a second click
 * to write the body. We make each click do one complete article so
 * the workflow is "click → 35s → ready-to-publish article on the
 * calendar". Chunk should be 1 to stay under serverless timeouts;
 * if you need to fill multiple slots, click multiple times.
 */
export async function planSeoMonth(input: {
  year: number;
  month: number; // 1-12
  chunk: number;
}): Promise<{ created: number; skipped: number; bodiesGenerated: number }> {
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
  if (openDates.length === 0) return { created: 0, skipped: 0, bodiesGenerated: 0 };

  // Get all existing slugs (across the whole DB, not just this month)
  // so the topic generator can avoid duplicates.
  const allSlugs = (
    await prisma.article.findMany({ select: { slug: true } })
  ).map((a) => a.slug);

  const toPlan = openDates.slice(0, input.chunk);
  let created = 0;
  let skipped = 0;
  let bodiesGenerated = 0;
  for (const date of toPlan) {
    try {
      const topic = await generateOneTopic([...allSlugs]);
      // De-dupe: if Gemini picked a slug we already have, fall through.
      if (allSlugs.includes(topic.slug)) {
        topic.slug = `${topic.slug}-${date.toISOString().slice(0, 10)}`;
      }
      const created_article = await prisma.article.create({
        data: {
          title: topic.title,
          slug: topic.slug,
          metaTitle: topic.metaTitle,
          metaDescription: topic.metaDescription,
          excerpt: topic.excerpt,
          // Initial placeholder — overwritten by generateArticleBody below.
          body: `<!-- ${topic.angle} -->\n\nGenerating…`,
          scheduledFor: date,
          published: false,
          contentGenerated: false,
        },
      });
      allSlugs.push(topic.slug);
      created++;
      // Same-call body generation. If Gemini fails on the body the
      // topic still survives as a planned draft and the admin can
      // hit "Generate body" or the daily cron will retry.
      const bodyResult = await generateArticleBody(created_article.id);
      if (bodyResult.ok) {
        bodiesGenerated++;
      } else {
        console.error("[seo-calendar] body gen failed for", created_article.id, bodyResult.error);
      }
    } catch (err) {
      console.error("[seo-calendar] topic generation failed:", err);
      skipped++;
    }
  }
  return { created, skipped, bodiesGenerated };
}

const CONTENT_SYSTEM_PROMPT = `You are a senior SEO content writer for PennyLime, a cash-advance product for US gig workers.

Write a complete blog article in **HTML** (not markdown). The blog renderer parses HTML directly via dangerouslySetInnerHTML, so markdown will display as raw text and look terrible. Use real HTML tags: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <a>, <table>, <tr>, <th>, <td>.

REQUIREMENTS:

- 900 to 1,400 words. TIGHT and useful, not bloated. The best gig-economy blog posts are read in 5 minutes and answer the question concretely.
- Open with ONE H2 introducing the topic + a short <p> setting up what the reader will learn. No "in this article" filler.
- 4-6 main sections, each with an H2. Use H3 sparingly inside sections only when truly needed.
- At least one section uses a <ul> or <ol> bullet list with 3-6 items.
- If the topic naturally calls for comparison (X vs Y, before/after, by-platform numbers), include ONE <table> with thead+tbody and clean rows.
- Concrete numbers, real timelines, specific platform names. NO fluff sentences like "in today's gig economy" or "as you might know".
- Tone: direct, practical, helpful. Not corporate, not salesy, not preachy.
- NEVER use em dashes. Use commas, parentheses, or sentence breaks instead.
- Naturally weave 2-3 internal links into the prose where it fits, using ONLY these slugs:
    <a href="/cash-advance">cash advance hub</a>
    <a href="/cash-advance/uber-drivers">Uber driver cash advance</a>
    <a href="/cash-advance/doordash-dashers">DoorDash cash advance</a>
    <a href="/cash-advance/amazon-flex-drivers">Amazon Flex cash advance</a>
    <a href="/cash-advance/instacart-shoppers">Instacart cash advance</a>
    <a href="/cash-advance/grubhub-drivers">Grubhub cash advance</a>
    <a href="/cash-advance/lyft-drivers">Lyft cash advance</a>
    <a href="/cash-advance/onlyfans-creators">OnlyFans creator advance</a>
    <a href="/cash-advance/etsy-sellers">Etsy seller advance</a>
    <a href="/cash-advance/twitch-streamers">Twitch streamer advance</a>
- End with a "Common questions" <h2> section: 3-4 <h3> question + <p> answer pairs (short, direct).
- End with ONE final <p> CTA encouraging the reader to apply, with a link to /apply.

OUTPUT FORMAT:
- Pure HTML body. No <html>, <head>, <body> wrapper. No <h1> (the title is rendered elsewhere).
- Start with <h2>. No preamble like "Here is the article:" — just HTML.
- No code fences around the HTML. No \`\`\`html.`;

/**
 * Generates an editorial hero illustration for a blog post via
 * Imagen, then saves it to the persistent /app/uploads Railway
 * Volume. Returns a /api/files/... URL that the blog renderer can
 * use as featuredImage.
 *
 * Why not /public/blog-images/{slug}.png: Railway's deployed bundle
 * is read-only at runtime, so we can't write into public/. The
 * existing hand-written blog posts that reference /blog-images are
 * static assets baked at build time. For AI-generated images we
 * use the /api/files dynamic-serving route + Railway Volume so
 * images survive deploys.
 */
async function generateBlogHeroImage(slug: string, title: string): Promise<string | null> {
  try {
    const ai = getClient();
    // Step 1: ask Gemini to pick 2-3 small physical objects that
    // together represent the article topic. We want a multi-object
    // floating-still-life composition, not a single hero object.
    const sceneRes = await ai.models.generateContent({
      model: TOPIC_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Given this blog post topic for a gig-economy finance brand:\n\n"${title}"\n\nList 2 or 3 small physical objects that together visually represent this topic. Keep each object specific and concrete (open laptop, paper form titled "1099", stack of poker chips or coins, a credit card, a phone showing a delivery app, a folded receipt, a calendar page, a gas pump nozzle, a piggy bank, a wallet, etc.).\n\nNO people, NO faces, NO logos, NO readable text apart from short labels like "1099" or "TAX" that fit naturally on a form.\n\nOutput one short line: just the objects separated by commas. No preamble, no quotes, no explanation.`,
            },
          ],
        },
      ],
      config: { temperature: 0.7 },
    });
    const scene = (sceneRes.text ?? "").replace(/^["']|["']$/g, "").trim();
    if (!scene) throw new Error("Empty scene from Gemini");

    // Step 2: render via Imagen with the soft-3D brand style.
    // Matches PennyLime's existing hand-crafted blog heroes: floating
    // 3D objects, pastel cream background, forest green + lime palette,
    // soft drop shadows beneath each object.
    const imagenPrompt = `Soft 3D-rendered isometric still life. Floating, weightless composition.

Objects in the scene: ${scene}

Background (CRITICAL — must match exactly):
- Solid flat off-white background, hex #f6f5f1. Very pale, very neutral. Slight warm undertone but NOT cream, NOT tan, NOT aqua, NOT gray-blue, NOT green-tinted.
- Think a clean sheet of premium printer paper photographed in soft daylight.
- COMPLETELY FLAT — no gradient, no vignette, no banding, no color variation anywhere. Same uniform pixel from edge to edge behind the objects.
- The background must NOT have any aqua, teal, sage, mint, blue, or cool tint. It must NOT have any saturated color. Only a pure neutral near-white.
- The only contrast against the background comes from the objects themselves and their drop shadows.

Color palette for objects (strict, no other hues):
- Primary accent: deep forest green (rich emerald, not too dark).
- Secondary accent: bright spring lime green (vibrant, fresh).
- Neutrals: warm bone white / cream for form panels and surfaces.
- Light gray for laptop bezel-style elements and structural neutrals.

Style:
- Soft 3D rendering with gentle dimensional shading on the OBJECTS only. Rounded corners on every shape. Toy-like, calm, modern.
- Each object floats with a soft, blurred gray drop shadow directly beneath it on the flat cream background. Shadows are soft-edged, low opacity, low contrast.
- Smooth ambient lighting from above-left, but lighting affects only the objects — not the background.
- Clean, minimal, premium fintech aesthetic. Like Stripe Press or modern finance app marketing.
- 2 to 3 objects arranged in loose composition with empty negative space around them. Centered or slightly off-center.

Quality:
- Photorealistic 3D render quality with matte surfaces on the objects.
- 16:9 aspect ratio.
- High detail, premium finish.

Do NOT include: people, faces, hands, photographs, gradient backgrounds, vignettes, sky-like backgrounds, neon, dark backgrounds, harsh shadows, stock-photo look, hand-drawn marks, flat 2D illustration style, multiple background colors, banding.`;

    const imagenRes = await ai.models.generateImages({
      model: "imagen-4.0-fast-generate-001",
      prompt: imagenPrompt,
      config: { numberOfImages: 1, aspectRatio: "16:9" },
    });
    const imgB64 = imagenRes.generatedImages?.[0]?.image?.imageBytes;
    if (!imgB64) throw new Error("Imagen returned no image bytes");
    const buffer = Buffer.from(imgB64, "base64");

    // Step 3: save into the persistent Railway Volume at /app/uploads
    // (same volume bank statements + ACH PDFs use). Subdirectory keeps
    // public blog heroes separate from private documents. Served via
    // the public /api/og-blog/{slug}.png route (no auth).
    //
    // IMPORTANT: must NOT use /app/blog-images — that path is part of
    // the ephemeral container filesystem and gets wiped on every
    // Railway redeploy.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir =
      process.env.BLOG_IMAGE_DIR ||
      path.join(process.env.UPLOAD_DIR || "/app/uploads", "blog-images");
    await fs.mkdir(dir, { recursive: true });
    const fileName = `${slug}.png`;
    const filePath = path.join(dir, fileName);
    await fs.writeFile(filePath, buffer);
    return `/api/og-blog/${fileName}`;
  } catch (err) {
    console.error("[seo-calendar] hero image generation failed:", err);
    return null;
  }
}

/**
 * Fills in the body for one already-planned Article via Gemini.
 * Marks contentGenerated=true on success. Also generates and attaches
 * a hero illustration via the social image pipeline.
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
    let body = (r.text ?? "").trim();
    // Strip code fences if Gemini wrapped the HTML in them despite the
    // explicit instruction not to.
    body = body.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
    if (!body || body.length < 800) {
      return { ok: false, error: "Generated body is too short — try again" };
    }

    // Generate hero image in parallel-friendly fashion. Best-effort —
    // article still publishes if image gen flakes (Imagen quota,
    // Cloudflare blocking, etc.).
    const heroImagePath = await generateBlogHeroImage(article.slug, article.title);

    await prisma.article.update({
      where: { id: articleId },
      data: {
        body,
        contentGenerated: true,
        ...(heroImagePath && { featuredImage: heroImagePath, ogImage: heroImagePath }),
      },
    });
    return { ok: true, wordCount: body.split(/\s+/).length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Generation failed" };
  }
}

/**
 * Publishes any article whose scheduledFor <= now AND already has its
 * body generated. Designed to be fast (~1s for typical loads) so a
 * cron-job.org daily call never times out.
 *
 * Articles that are past their date but DON'T have a body are surfaced
 * in `missingBodies` — admin should fix those manually via the
 * calendar's "Generate body" button. We don't generate bodies in the
 * cron path because Gemini takes ~30s each and stacks past cron
 * timeouts when there's a backlog.
 */
export async function publishScheduledArticles(): Promise<{ published: number; missingBodies: number }> {
  const now = new Date();

  // Fast bulk update: any due article that has a body, publish it.
  // Single SQL statement. No N+1.
  const updateResult = await prisma.article.updateMany({
    where: {
      scheduledFor: { lte: now },
      published: false,
      contentGenerated: true,
    },
    data: { published: true, publishedAt: new Date() },
  });

  // Count any due articles that DON'T have a body so admin can see
  // them in the cron response and react.
  const missingBodies = await prisma.article.count({
    where: {
      scheduledFor: { lte: now },
      published: false,
      contentGenerated: false,
    },
  });

  return { published: updateResult.count, missingBodies };
}
