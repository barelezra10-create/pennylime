"use server";

import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { GoogleGenAI } from "@google/genai";
import { authOptions } from "@/lib/auth";
import { saveImage } from "@/lib/social/storage";

const IMAGEN_MODEL = "imagen-4.0-fast-generate-001";

const GIVEAWAY_RULES_BLOCK = `To enter:
1. Follow @pennylime
2. Tag 2 friends who are small business owners or 1099 freelancers
3. Share this post to your story
4. DM us "done" once all 3 are complete

One winner picked at random from completed entries.
Live through June 30 only. Open to U.S. residents 18+. No purchase necessary.

#smallbusinessowner #1099 #freelancer #smallbiz #giveaway #amazongiftcard #entrepreneur #sidehustle #businessowner #pennylime`;

const CAPTION_VARIANTS: Array<{ tag: string; hook: string }> = [
  {
    tag: "kickoff",
    hook: `GIVEAWAY TIME 🎁\n\nWe're sending one small business owner a $500 Amazon gift card. On us.\n\nWhy? Because running a business or freelancing on 1099 income is hard, and we want to back the people doing the work.`,
  },
  {
    tag: "reminder-1",
    hook: `Still time to enter our $500 Amazon gift card giveaway 🎁\n\nOne small business owner walks away with $500 on Amazon. Could be you.`,
  },
  {
    tag: "midmonth",
    hook: `Halfway through June and we're STILL giving away $500 on Amazon to one small business owner 🎁\n\nIf you missed the first post, here is your second chance.`,
  },
  {
    tag: "engagement-push",
    hook: `Real talk: small business owners and 1099 freelancers don't get enough love. So we're doing something about it.\n\n$500 Amazon gift card. One winner. End of June.`,
  },
  {
    tag: "still-time",
    hook: `Last 10 days to enter our $500 Amazon gift card giveaway 🎁\n\nOne small business owner. One $500 Amazon gift card. Picked at the end of June.`,
  },
  {
    tag: "final-week",
    hook: `Final week of the giveaway 🚨\n\n$500 Amazon gift card going to one small business owner or 1099 freelancer. Winner picked June 30.`,
  },
  {
    tag: "last-day",
    hook: `LAST DAY to enter ⏰\n\nWe're picking the winner of the $500 Amazon gift card tonight. If you haven't entered, this is it.`,
  },
];

// Pick the June 2026 dates we want to publish on. Spread roughly every
// 4 days so the campaign stays visible without spamming the feed.
const JUNE_2026_DATES = [3, 7, 12, 17, 22, 27, 30] as const;

function publishTimeFor(day: number): Date {
  // 15:00 UTC matches the existing publish cron window
  return new Date(Date.UTC(2026, 5, day, 15, 0, 0));
}

function buildCaption(hook: string): string {
  return `${hook}\n\n${GIVEAWAY_RULES_BLOCK}`;
}

async function generateGiveawayImage(): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY required");
  const client = new GoogleGenAI({ apiKey });

  const prompt = `Editorial flat illustration with subtle dimension and grain.

Scene: A flat-lay overhead arrangement on a warm cream paper surface. Center: a slim orange gift card (no readable text, no logo) tucked under a dark brown twine bow. Around it: a fanned arc of crisp paper bills (no faces visible), scattered gold confetti dots, a small succulent in a terracotta pot in the upper right corner, a leather-bound notebook in the lower left.

Visual style:
A two-color palette only. Deep emerald forest green for primary shapes, vivid citrus lime green for highlights and accents. Background and neutrals in warm cream paper. No other hues. Soft drop shadows. Hand-drawn line quality.

Composition:
Documentary observational angle, as if a passerby caught the moment from directly above. Tight on the objects. The objects fill the frame; they are the subject. The scene is wordless and silent, purely a still life of the celebration props.

Render quality:
Editorial, modern, calm, confident. Like a New York Times opinion-page illustration. Not 3D rendered. Not cartoonish. Not stock photo. Not generic fintech gradient. 1:1 aspect ratio.

Typography:
If any incidental lettering appears in the scene, it is rendered in clean English using the standard Latin alphabet. No Arabic script, no Cyrillic, no Chinese / Japanese / Korean characters, no decorative foreign typography, no garbled or invented characters. US-style English only.`;

  const response = await client.models.generateImages({
    model: IMAGEN_MODEL,
    prompt,
    config: { numberOfImages: 1, aspectRatio: "1:1" },
  });

  const img = response.generatedImages?.[0]?.image?.imageBytes;
  if (!img) throw new Error("Imagen returned no image");
  return await saveImage(Buffer.from(img, "base64"), "png");
}

export async function scheduleGiveawayCampaign(): Promise<
  | { ok: true; scheduled: number; skipped: number; imageUrl: string }
  | { ok: false; error: string }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false, error: "Not authenticated" };

  const account = await prisma.socialAccount.findUnique({
    where: { platform_handle: { platform: "instagram", handle: "@pennylime" } },
  });
  if (!account) return { ok: false, error: "No @pennylime Instagram account configured" };

  // Generate the campaign image once. All 7 posts share it so the
  // campaign reads as a coherent series in the feed and we only burn
  // one Imagen call.
  let imageUrl: string;
  try {
    imageUrl = await generateGiveawayImage();
  } catch (err) {
    return { ok: false, error: `Image generation failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  let scheduled = 0;
  let skipped = 0;
  for (let i = 0; i < JUNE_2026_DATES.length; i++) {
    const day = JUNE_2026_DATES[i];
    const variant = CAPTION_VARIANTS[i];
    const scheduledFor = publishTimeFor(day);

    // Skip if a post is already scheduled for this exact slot (idempotent
    // re-runs). We match on the unique scheduledFor for this account.
    const existing = await prisma.socialPost.findFirst({
      where: {
        accountId: account.id,
        scheduledFor,
      },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.socialPost.create({
      data: {
        accountId: account.id,
        topic: `Giveaway: $500 Amazon gift card (${variant.tag})`,
        body: buildCaption(variant.hook),
        imageUrl,
        scheduledFor,
        status: "planned",
      },
    });
    scheduled++;
  }

  return { ok: true, scheduled, skipped, imageUrl };
}
