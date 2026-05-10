# PennyLime Social Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous social presence system for `@pennylime` on IG/FB/LinkedIn/TikTok — generates 1 post/day per platform via Gemini, publishes via official APIs, runs an engagement bot (Python) that performs ~25 likes + ~7 follows/day per account on gig-worker hashtag/geo targets.

**Architecture:** Two Railway services in the existing PennyLime project sharing the same Postgres. The Next.js app handles content generation (Gemini), official-API posting (Meta Graph, LinkedIn Marketing, TikTok Content Posting), and the admin UI at `/admin/social/`. A new Python service (`bot/`) consumes an `EngagementTarget` queue from Postgres and performs likes/follows via unofficial libraries (`instagrapi`, `linkedin-api`, `TikTokApi`).

**Tech Stack:**
- Next.js 16, Prisma 7, Postgres (existing)
- `@google/genai` for text + image generation (existing dep)
- Meta Graph API v22, LinkedIn Marketing API, TikTok Content Posting API
- Python 3.12, `instagrapi`, `facebook_scraper`, `linkedin-api`, `TikTokApi`, `asyncpg`
- Railway for deploy, AES-GCM for token encryption

**Note on testing:** This codebase has no test framework. Per project conventions, this plan uses runtime verification (curl, DB queries, manual cron triggers) instead of unit tests. Each task has explicit verification steps.

**Reference spec:** `docs/superpowers/specs/2026-05-10-pennylime-social-bot-design.md`

**Phase structure:**
- **Phase 1** — Foundation (schema, crypto, topic seed): Tasks 1-4
- **Phase 2** — Generator + RSS + Blocklist: Tasks 5-9
- **Phase 3** — Publishers + Engagement target builder: Tasks 10-14
- **Phase 4** — Cron endpoints: Tasks 15-18
- **Phase 5** — Admin UI: Tasks 19-23
- **Phase 6** — Python engagement bot: Tasks 24-30
- **Phase 7** — Deployment + kill switch + acceptance: Tasks 31-34

Each phase ends with a "shippable state" — you can stop after any phase and have working software (subset of full system).

---

## Phase 1 — Foundation

### Task 1: Add Prisma models for social bot

**Files:**
- Modify: `prisma/schema.prisma` (append at end of file)

- [ ] **Step 1: Append the 5 new models to `prisma/schema.prisma`**

```prisma
// ============================================================================
// Social Bot
// ============================================================================

model SocialAccount {
  id                String          @id @default(cuid())
  platform          String          // "instagram" | "facebook" | "linkedin" | "tiktok"
  handle            String          // "@pennylime"
  accessToken       String          // encrypted at rest (AES-GCM via NEXTAUTH_SECRET)
  refreshToken      String?
  tokenExpiresAt    DateTime?
  platformAccountId String?         // IG business user id / FB page id / LI org id (TT not used)
  botCookies        String?         // encrypted instagrapi/cookie session blob
  botStatus         String          @default("healthy") // "healthy" | "challenged" | "banned"
  lastBotAction     DateTime?
  createdAt         DateTime        @default(now())

  posts             SocialPost[]
  engagements       EngagementLog[]

  @@unique([platform, handle])
}

model SocialPost {
  id             String        @id @default(cuid())
  accountId      String
  account        SocialAccount @relation(fields: [accountId], references: [id])
  topic          String
  body           String        @db.Text
  imageUrl       String?
  scheduledFor   DateTime
  status         String        @default("pending") // "pending"|"published"|"failed"|"blocked"
  platformPostId String?
  publishError   String?       @db.Text
  publishedAt    DateTime?
  createdAt      DateTime      @default(now())

  @@index([status, scheduledFor])
}

model TopicPool {
  id         String    @id @default(cuid())
  topic      String    @db.Text
  category   String    // "tax" | "cashflow" | "platform-tips" | "earnings" | "savings" | "news"
  lastUsedAt DateTime?
  useCount   Int       @default(0)
  active     Boolean   @default(true)
}

model EngagementTarget {
  id           String    @id @default(cuid())
  platform     String
  source       String    // "hashtag:#uberdriver" | "geo:los-angeles+keyword:doordash"
  targetHandle String
  targetPostId String?
  action       String    // "like" | "follow"
  status       String    @default("queued") // "queued"|"done"|"skipped"|"failed"
  createdAt    DateTime  @default(now())
  processedAt  DateTime?

  @@index([platform, status, createdAt])
}

model EngagementLog {
  id           String        @id @default(cuid())
  accountId    String
  account      SocialAccount @relation(fields: [accountId], references: [id])
  platform     String
  action       String        // "like" | "follow" | "unfollow"
  targetHandle String
  targetPostId String?
  success      Boolean
  error        String?       @db.Text
  createdAt    DateTime      @default(now())

  @@index([accountId, createdAt])
}
```

- [ ] **Step 2: Generate migration**

Run:
```bash
cd ~/pennylime
DATABASE_URL="$(railway variables -s pennylime --kv | grep DATABASE_PUBLIC_URL | cut -d= -f2-)" \
  npx prisma migrate dev --name add_social_bot_models
```

Expected: new migration directory `prisma/migrations/<timestamp>_add_social_bot_models/` containing `migration.sql` with 5 CREATE TABLE statements + indexes.

- [ ] **Step 3: Verify migration applied to local Postgres**

Run:
```bash
DATABASE_URL="$(railway variables -s pennylime --kv | grep DATABASE_PUBLIC_URL | cut -d= -f2-)" \
  npx prisma studio
```

Then in Studio: confirm 5 new models appear (`SocialAccount`, `SocialPost`, `TopicPool`, `EngagementTarget`, `EngagementLog`), all with empty rows.

- [ ] **Step 4: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add prisma/schema.prisma prisma/migrations/
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): add Prisma models for social bot

- SocialAccount (creds + bot status per platform)
- SocialPost (post lifecycle)
- TopicPool (content seed library)
- EngagementTarget (bot action queue)
- EngagementLog (audit trail)"
```

---

### Task 2: AES-GCM crypto helper for token storage

**Files:**
- Create: `src/lib/social/crypto.ts`

- [ ] **Step 1: Create `src/lib/social/crypto.ts`**

```typescript
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT = Buffer.from("pennylime-social-v1", "utf8");

function deriveKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET required for social crypto");
  return crypto.scryptSync(secret, SALT, 32);
}

export function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // format: base64(iv || tag || ciphertext)
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const key = deriveKey();
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
```

- [ ] **Step 2: Verify roundtrip**

Run:
```bash
NEXTAUTH_SECRET="test-secret-do-not-use" npx tsx -e "
import { encrypt, decrypt } from './src/lib/social/crypto';
const out = encrypt('hello-token-123');
console.log('encrypted:', out);
console.log('decrypted:', decrypt(out));
"
```

Expected: prints encrypted base64 + `decrypted: hello-token-123`.

- [ ] **Step 3: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/lib/social/crypto.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): AES-GCM crypto helper for token storage"
```

---

### Task 3: Topic pool seeder script

**Files:**
- Create: `scripts/seed-social-topics.ts`

- [ ] **Step 1: Create `scripts/seed-social-topics.ts`**

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TOPICS: Array<{ topic: string; category: string }> = [
  // tax
  { topic: "How to track Uber/Lyft mileage for tax deductions", category: "tax" },
  { topic: "Quarterly estimated taxes for gig workers — exactly how much to set aside", category: "tax" },
  { topic: "1099 vs W-2: what gig workers need to know at tax time", category: "tax" },
  { topic: "Top 7 tax deductions DoorDash drivers miss every year", category: "tax" },
  { topic: "Standard mileage vs actual expense — which saves gig drivers more?", category: "tax" },
  { topic: "How to file a Schedule C for gig income (step by step)", category: "tax" },
  { topic: "Self-employment tax explained for first-time gig workers", category: "tax" },
  { topic: "Can you write off your phone bill as an Uber driver? (Yes — here's how much)", category: "tax" },
  { topic: "Hot bag, car wash, dash cam — surprising DoorDash deductions", category: "tax" },
  { topic: "What to do if you forgot to track miles for the year", category: "tax" },

  // cashflow
  { topic: "Smoothing variable income: the 50/30/20 rule for gig workers", category: "cashflow" },
  { topic: "How to budget when your weekly pay swings $300-$1,200", category: "cashflow" },
  { topic: "Building a 1-month buffer on gig income (without working 80hr weeks)", category: "cashflow" },
  { topic: "Why gig workers should pay themselves a 'salary' from a buffer account", category: "cashflow" },
  { topic: "The 3-account system for gig workers (operating / tax / personal)", category: "cashflow" },
  { topic: "How to handle a slow week when rent is due in 5 days", category: "cashflow" },
  { topic: "Cash advance vs payday loan vs credit card — costs compared", category: "cashflow" },
  { topic: "Why $300 today can cost you $90 tomorrow (and how to avoid it)", category: "cashflow" },
  { topic: "Bridging the gap between Uber payouts (Tuesday vs daily cashout)", category: "cashflow" },
  { topic: "How to use Plaid-connected apps to predict your slow weeks", category: "cashflow" },

  // platform-tips
  { topic: "Top 5 surge windows for Uber drivers in 2026 (data-backed)", category: "platform-tips" },
  { topic: "Multi-apping: how to stack DoorDash + Uber Eats + Grubhub safely", category: "platform-tips" },
  { topic: "Acceptance rate vs cancellation rate — which actually matters", category: "platform-tips" },
  { topic: "Hidden DoorDash hot zones: how to find them in your city", category: "platform-tips" },
  { topic: "Lyft Power Driver tier: is it worth chasing in 2026?", category: "platform-tips" },
  { topic: "Why declining short Uber trips is hurting your hourly rate", category: "platform-tips" },
  { topic: "Instacart batch quality: read the order before accepting", category: "platform-tips" },
  { topic: "Uber Pro Diamond perks ranked from 'use daily' to 'never'", category: "platform-tips" },
  { topic: "How to handle a low rating (and when to ask Uber to remove it)", category: "platform-tips" },
  { topic: "Best times to drive on Sunday — a city-by-city breakdown", category: "platform-tips" },

  // earnings
  { topic: "Why your hourly rate looks great until you subtract gas + depreciation", category: "earnings" },
  { topic: "True cost per mile: the calculation Uber doesn't show you", category: "earnings" },
  { topic: "Hybrid vs gas vs EV: which actually pays best for rideshare in 2026", category: "earnings" },
  { topic: "Tipping breakdown: when DoorDash riders actually tip well", category: "earnings" },
  { topic: "How long-distance trips really pay (the dead-mile problem)", category: "earnings" },
  { topic: "Should you pay $40 for a car wash to keep your 4.99 rating?", category: "earnings" },
  { topic: "Gas card stacking: Upside + Costco + GetUpside in 2026", category: "earnings" },
  { topic: "Tire wear math: how many miles before tires eat your weekly profit", category: "earnings" },
  { topic: "Insurance gotchas: rideshare endorsement vs commercial policy", category: "earnings" },
  { topic: "Tracking your real take-home with one simple weekly spreadsheet", category: "earnings" },

  // savings
  { topic: "Building an emergency fund on gig income (a 90-day plan)", category: "savings" },
  { topic: "Why gig workers need a Roth IRA more than W-2 workers do", category: "savings" },
  { topic: "Solo 401(k) for full-time DoorDashers: how the math works", category: "savings" },
  { topic: "HSA accounts for self-employed gig workers — overlooked superpower", category: "savings" },
  { topic: "How to save for a car upgrade without killing your operating cash", category: "savings" },
  { topic: "The 'pay yourself first' rule, adapted for daily Uber payouts", category: "savings" },
  { topic: "When a high-yield savings account beats your Uber Pro debit card", category: "savings" },
  { topic: "Emergency fund vs cash advance: when each one wins", category: "savings" },
  { topic: "How $50/week saved on gas equals $2,600 a year (compound interest math)", category: "savings" },
  { topic: "Why most gig workers are underinsured — and what to fix first", category: "savings" },
];

async function main() {
  let inserted = 0;
  for (const t of TOPICS) {
    const exists = await prisma.topicPool.findFirst({ where: { topic: t.topic } });
    if (exists) continue;
    await prisma.topicPool.create({ data: { topic: t.topic, category: t.category } });
    inserted++;
  }
  console.log(`Seeded ${inserted} topics (${TOPICS.length - inserted} already existed)`);
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the seeder against local Postgres**

Run:
```bash
DATABASE_URL="$(railway variables -s pennylime --kv | grep DATABASE_PUBLIC_URL | cut -d= -f2-)" \
  npx tsx scripts/seed-social-topics.ts
```

Expected: `Seeded 50 topics (0 already existed)`.

- [ ] **Step 3: Verify in DB**

Run:
```bash
DATABASE_URL="$(railway variables -s pennylime --kv | grep DATABASE_PUBLIC_URL | cut -d= -f2-)" \
  npx prisma studio
```

Open `TopicPool` model — confirm 50 rows across 5 categories.

- [ ] **Step 4: Add to package.json scripts and commit**

Modify `package.json` `scripts` section:
```diff
   "deploy:db": "prisma migrate deploy && npx tsx prisma/seed.ts && npx tsx scripts/seed-content.ts && npx tsx scripts/seed-landing-pages.ts && npx tsx scripts/seed-form-templates.ts && npx tsx scripts/seed-email-sequences.ts && npx tsx scripts/seed-demo-data.ts && npx tsx scripts/seed-plaid-test-app.ts",
+  "seed:social-topics": "tsx scripts/seed-social-topics.ts",
```

Then:
```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add scripts/seed-social-topics.ts package.json
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): seed 50 starter topics across 5 categories"
```

---

### Task 4: SocialAccount seeder + manual creds entry

**Files:**
- Create: `scripts/seed-social-accounts.ts`

- [ ] **Step 1: Create `scripts/seed-social-accounts.ts`**

This creates empty `SocialAccount` rows for all 4 platforms — credentials are added later via the admin UI re-auth flow.

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ACCOUNTS = [
  { platform: "instagram", handle: "@pennylime" },
  { platform: "facebook", handle: "@pennylime" },
  { platform: "linkedin", handle: "@pennylime" },
  { platform: "tiktok", handle: "@pennylime" },
];

async function main() {
  for (const a of ACCOUNTS) {
    await prisma.socialAccount.upsert({
      where: { platform_handle: { platform: a.platform, handle: a.handle } },
      create: { ...a, accessToken: "" },
      update: {},
    });
    console.log(`✓ ${a.platform} ${a.handle}`);
  }
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run seeder**

Run:
```bash
DATABASE_URL="$(railway variables -s pennylime --kv | grep DATABASE_PUBLIC_URL | cut -d= -f2-)" \
  npx tsx scripts/seed-social-accounts.ts
```

Expected: 4 lines `✓ instagram @pennylime` etc.

- [ ] **Step 3: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add scripts/seed-social-accounts.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): seed empty SocialAccount rows for 4 platforms"
```

**Phase 1 shippable state:** Schema deployed, 50 topics + 4 empty accounts in DB. No posting yet.

---

## Phase 2 — Generator + RSS + Blocklist

### Task 5: Compliance blocklist

**Files:**
- Create: `src/lib/social/blocklist.ts`

- [ ] **Step 1: Create `src/lib/social/blocklist.ts`**

```typescript
const FORBIDDEN_TERMS: ReadonlyArray<RegExp> = [
  /\bguaranteed\b/i,
  /\bguaranteed approval\b/i,
  /\bno credit check\b/i,
  /\bno credit\b/i,
  /\binstant approval\b/i,
  /\bzero fees\b/i,
  /\bno fees\b/i,
  /\b0%\s*apr\b/i,
  /\bapproved in seconds\b/i,
  /\beveryone qualifies\b/i,
  /\bbad credit ok\b/i,
  /\bany credit accepted\b/i,
  /\b\$\d{3,}\s*today\b/i,    // "$500 today" style
  /\bget cash now\b/i,
];

export interface BlocklistResult {
  passed: boolean;
  matches: string[];
}

export function checkBlocklist(text: string): BlocklistResult {
  const matches: string[] = [];
  for (const pattern of FORBIDDEN_TERMS) {
    const m = text.match(pattern);
    if (m) matches.push(m[0]);
  }
  return { passed: matches.length === 0, matches };
}
```

- [ ] **Step 2: Verify both pass and fail cases**

Run:
```bash
npx tsx -e "
import { checkBlocklist } from './src/lib/social/blocklist';
console.log('clean:', checkBlocklist('Track your Uber miles for taxes'));
console.log('flagged:', checkBlocklist('Get \$500 today, no credit check, instant approval!'));
"
```

Expected:
- `clean: { passed: true, matches: [] }`
- `flagged: { passed: false, matches: [ '$500 today', 'no credit check', 'instant approval' ] }`

- [ ] **Step 3: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/lib/social/blocklist.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): compliance blocklist filter"
```

---

### Task 6: Gemini text generator (per-platform prompts)

**Files:**
- Create: `src/lib/social/generator/text.ts`

- [ ] **Step 1: Create `src/lib/social/generator/text.ts`**

```typescript
import { GoogleGenAI } from "@google/genai";

type Platform = "instagram" | "facebook" | "linkedin" | "tiktok";

const PLATFORM_BRIEFS: Record<Platform, string> = {
  instagram: `Instagram caption. Punchy hook in line 1, 3-5 short paragraphs, 4-6 relevant hashtags at end. 800 chars max. Speak to gig workers (Uber/DoorDash/Lyft) directly. Conversational, not corporate.`,
  facebook: `Facebook post. Hook in first sentence, 2-3 paragraphs, no hashtags. 1200 chars max. Focus on practical takeaway. Audience: US gig workers reading on their phone between rides.`,
  linkedin: `LinkedIn post. Professional but human tone. 3-4 paragraphs. Frame PennyLime as a fintech serving the gig economy — mission-driven angle. Position the topic as evidence of why financial tools for variable-income workers matter. 1500 chars max. End with a thought-provoking question.`,
  tiktok: `TikTok caption (image post — square format). Hook in 1 line, 2-3 short bullet-style insights, 4-6 hashtags. 300 chars max. Energetic gig-worker creator voice.`,
};

const SYSTEM_PROMPT = `You write social media content for PennyLime, a cash advance product for gig-economy workers (Uber, Lyft, DoorDash, Instacart, Grubhub, Amazon Flex). Audience = US gig workers managing variable income.

STRICT RULES:
- Never use these words: guaranteed, instant approval, no credit check, no fees, "approved in seconds", "everyone qualifies"
- Never make APR claims or promise specific dollar amounts in the headline
- Never use em dashes (—) or long dashes — use commas, periods, or parentheses instead
- Speak TO the gig worker, not ABOUT them
- Lead with practical value, mention PennyLime only if it fits naturally (max 1 mention)
- No emojis except 1 in the hook line if it fits the platform`;

export async function generatePostText(topic: string, platform: Platform): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY required");

  const client = new GoogleGenAI({ apiKey });
  const prompt = `${SYSTEM_PROMPT}

PLATFORM BRIEF: ${PLATFORM_BRIEFS[platform]}

TOPIC: ${topic}

Write the post now. Output ONLY the post body, no preamble, no quotes around it.`;

  const response = await client.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: prompt,
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned empty text");
  // strip surrounding quotes if model added them
  return text.replace(/^["']|["']$/g, "").trim();
}
```

- [ ] **Step 2: Verify Gemini call works for each platform**

Run:
```bash
GEMINI_API_KEY="$(cat ~/.claude/projects/-Users-baralezrah/memory/reference_gemini_api_new.md | grep -E '^[A-Za-z0-9_-]{30,}$' | head -1)" \
  npx tsx -e "
import { generatePostText } from './src/lib/social/generator/text';
(async () => {
  for (const p of ['instagram','facebook','linkedin','tiktok'] as const) {
    console.log('=== ' + p + ' ===');
    console.log(await generatePostText('Top 5 surge windows for Uber drivers', p));
    console.log();
  }
})();
"
```

Expected: 4 posts printed, each in the right voice/length for its platform, no em-dashes, no blocklist terms.

- [ ] **Step 3: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/lib/social/generator/text.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): Gemini text generator with per-platform prompts"
```

---

### Task 7: Gemini image generator + R2/local storage

**Files:**
- Create: `src/lib/social/generator/image.ts`
- Create: `src/lib/social/storage.ts`

- [ ] **Step 1: Create `src/lib/social/storage.ts` (Railway volume + public URL via existing app)**

```typescript
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const STORAGE_DIR = process.env.SOCIAL_IMAGE_DIR ?? "/tmp/pennylime-social";
const PUBLIC_BASE = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export async function saveImage(buffer: Buffer, ext: string): Promise<string> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(STORAGE_DIR, name), buffer);
  return `${PUBLIC_BASE}/api/social/image/${name}`;
}

export async function readImage(name: string): Promise<Buffer | null> {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = path.join(STORAGE_DIR, safe);
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Create the image-serving route**

Create `src/app/api/social/image/[name]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { readImage } from "@/lib/social/storage";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const buf = await readImage(name);
  if (!buf) return NextResponse.json({ error: "not found" }, { status: 404 });
  const ext = name.split(".").pop()?.toLowerCase() ?? "png";
  const ct = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
  return new NextResponse(buf, {
    headers: { "content-type": ct, "cache-control": "public, max-age=31536000, immutable" },
  });
}
```

- [ ] **Step 3: Create `src/lib/social/generator/image.ts`**

```typescript
import { GoogleGenAI } from "@google/genai";
import { saveImage } from "../storage";

type Platform = "instagram" | "facebook" | "linkedin" | "tiktok";

const ASPECTS: Record<Platform, { width: number; height: number; aspectRatio: string }> = {
  instagram: { width: 1080, height: 1080, aspectRatio: "1:1" },
  facebook: { width: 1200, height: 630, aspectRatio: "1.91:1" },
  linkedin: { width: 1200, height: 627, aspectRatio: "1.91:1" },
  tiktok: { width: 1080, height: 1920, aspectRatio: "9:16" },
};

export async function generatePostImage(topic: string, platform: Platform): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY required");

  const client = new GoogleGenAI({ apiKey });
  const aspect = ASPECTS[platform];

  const prompt = `Editorial illustration for a social media post about: "${topic}".
Style: clean, modern, fintech-friendly, gig economy aesthetic. Subtle palette using deep navy, lime green (#7BFF00), white, soft shadows. NO text in image. NO logos. NO faces (avoid likeness issues). Aspect ratio ${aspect.aspectRatio}. ${aspect.width}x${aspect.height}px.`;

  const response = await client.models.generateImages({
    model: "imagen-4.0-generate-001",
    prompt,
    config: { numberOfImages: 1, aspectRatio: aspect.aspectRatio },
  });

  const img = response.generatedImages?.[0]?.image?.imageBytes;
  if (!img) throw new Error("Gemini returned no image");

  const buffer = Buffer.from(img, "base64");
  return await saveImage(buffer, "png");
}
```

- [ ] **Step 4: Verify image generation + serving**

Run:
```bash
GEMINI_API_KEY="..." npx tsx -e "
import { generatePostImage } from './src/lib/social/generator/image';
(async () => { console.log(await generatePostImage('Track Uber miles for taxes', 'instagram')); })();
"
```

Then in another shell with `npm run dev` running, `curl -I` the returned URL — expect `200 OK content-type: image/png`.

- [ ] **Step 5: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/lib/social/generator/image.ts src/lib/social/storage.ts src/app/api/social/image/
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): Gemini Imagen image generator + serving route"
```

---

### Task 8: RSS poller for trending topics

**Files:**
- Create: `src/lib/social/topics/rss.ts`

- [ ] **Step 1: Install RSS parser**

Run:
```bash
npm install rss-parser
```

- [ ] **Step 2: Create `src/lib/social/topics/rss.ts`**

```typescript
import Parser from "rss-parser";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const parser = new Parser({ timeout: 15000 });

const FEEDS = [
  "https://therideshareguy.com/feed/",
  "https://gridwise.io/blog/feed/",
  "https://www.bls.gov/feed/news_release.rss",
  "https://www.reddit.com/r/uberdrivers/top.rss?t=week",
];

export async function pollRssFeeds(): Promise<{ inserted: number; total: number }> {
  let inserted = 0;
  let total = 0;
  for (const url of FEEDS) {
    try {
      const feed = await parser.parseURL(url);
      for (const item of (feed.items ?? []).slice(0, 10)) {
        total++;
        const topic = item.title?.trim();
        if (!topic) continue;
        const exists = await prisma.topicPool.findFirst({ where: { topic } });
        if (exists) continue;
        await prisma.topicPool.create({
          data: { topic, category: "news" },
        });
        inserted++;
      }
    } catch (err) {
      console.error(`RSS feed failed: ${url}`, err);
    }
  }
  return { inserted, total };
}
```

- [ ] **Step 3: Verify RSS pull works**

Run:
```bash
DATABASE_URL="..." npx tsx -e "
import { pollRssFeeds } from './src/lib/social/topics/rss';
(async () => console.log(await pollRssFeeds()))();
"
```

Expected: `{ inserted: <number>, total: <number> }`. Check Prisma Studio — new topics with `category: 'news'`.

- [ ] **Step 4: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/lib/social/topics/rss.ts package.json package-lock.json
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): RSS poller for trending gig-economy topics"
```

---

### Task 9: Topic picker (round-robin from pool, prefer least-used)

**Files:**
- Create: `src/lib/social/topics/picker.ts`

- [ ] **Step 1: Create `src/lib/social/topics/picker.ts`**

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function pickNextTopic(): Promise<{ id: string; topic: string; category: string } | null> {
  // Prefer least-recently-used active topic. Within ties, lowest useCount wins.
  const topic = await prisma.topicPool.findFirst({
    where: { active: true },
    orderBy: [{ lastUsedAt: { sort: "asc", nulls: "first" } }, { useCount: "asc" }],
  });
  if (!topic) return null;
  await prisma.topicPool.update({
    where: { id: topic.id },
    data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
  });
  return { id: topic.id, topic: topic.topic, category: topic.category };
}
```

- [ ] **Step 2: Verify picker rotates**

Run:
```bash
DATABASE_URL="..." npx tsx -e "
import { pickNextTopic } from './src/lib/social/topics/picker';
(async () => {
  for (let i = 0; i < 3; i++) console.log(await pickNextTopic());
})();
"
```

Expected: 3 different topics, each with the just-incremented `useCount`.

- [ ] **Step 3: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/lib/social/topics/picker.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): topic picker with LRU rotation"
```

**Phase 2 shippable state:** Can generate text + image for any platform, blocklist works, RSS topics flow into pool.

---

## Phase 3 — Publishers + Engagement Target Builder

### Task 10: Meta publisher (IG + FB)

**Files:**
- Create: `src/lib/social/publishers/meta.ts`

- [ ] **Step 1: Create `src/lib/social/publishers/meta.ts`**

```typescript
import { decrypt } from "../crypto";

interface PublishResult { platformPostId: string }

export async function publishToInstagram(
  encryptedAccessToken: string,
  igUserId: string,
  imageUrl: string,
  caption: string,
): Promise<PublishResult> {
  const token = decrypt(encryptedAccessToken);

  // Step 1: create container
  const containerRes = await fetch(
    `https://graph.facebook.com/v22.0/${igUserId}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}&access_token=${token}`,
    { method: "POST" },
  );
  const container = await containerRes.json();
  if (!container.id) throw new Error(`IG container failed: ${JSON.stringify(container)}`);

  // Step 2: publish
  const pubRes = await fetch(
    `https://graph.facebook.com/v22.0/${igUserId}/media_publish?creation_id=${container.id}&access_token=${token}`,
    { method: "POST" },
  );
  const pub = await pubRes.json();
  if (!pub.id) throw new Error(`IG publish failed: ${JSON.stringify(pub)}`);
  return { platformPostId: pub.id };
}

export async function publishToFacebook(
  encryptedPageToken: string,
  pageId: string,
  imageUrl: string,
  message: string,
): Promise<PublishResult> {
  const token = decrypt(encryptedPageToken);
  const res = await fetch(
    `https://graph.facebook.com/v22.0/${pageId}/photos?url=${encodeURIComponent(imageUrl)}&message=${encodeURIComponent(message)}&access_token=${token}`,
    { method: "POST" },
  );
  const json = await res.json();
  if (!json.id) throw new Error(`FB publish failed: ${JSON.stringify(json)}`);
  return { platformPostId: json.post_id ?? json.id };
}
```

- [ ] **Step 2: Note for verification**

This task can't be runtime-verified until real Meta access tokens + IG business user ID + FB page ID are stored in `SocialAccount` (handled in Task 23 admin re-auth flow). Skip runtime verification here — types compile is the gate.

Run: `npx tsc --noEmit` — expect: clean exit.

- [ ] **Step 3: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/lib/social/publishers/meta.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): Meta publisher (IG + FB) via Graph API v22"
```

---

### Task 11: LinkedIn publisher

**Files:**
- Create: `src/lib/social/publishers/linkedin.ts`

- [ ] **Step 1: Create `src/lib/social/publishers/linkedin.ts`**

```typescript
import { decrypt } from "../crypto";

interface PublishResult { platformPostId: string }

export async function publishToLinkedIn(
  encryptedAccessToken: string,
  organizationId: string,  // urn:li:organization:XXXXX
  imageUrl: string,
  text: string,
): Promise<PublishResult> {
  const token = decrypt(encryptedAccessToken);
  const author = `urn:li:organization:${organizationId}`;

  // Step 1: register upload
  const regRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      registerUploadRequest: {
        owner: author,
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        serviceRelationships: [{ identifier: "urn:li:userGeneratedContent", relationshipType: "OWNER" }],
      },
    }),
  });
  const reg = await regRes.json();
  const uploadUrl = reg?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
  const asset = reg?.value?.asset;
  if (!uploadUrl || !asset) throw new Error(`LI register failed: ${JSON.stringify(reg)}`);

  // Step 2: download image and upload to LI
  const imgRes = await fetch(imageUrl);
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
  const upRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: imgBuf,
  });
  if (!upRes.ok) throw new Error(`LI image upload failed: ${upRes.status}`);

  // Step 3: create UGC post
  const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "IMAGE",
          media: [{ status: "READY", media: asset }],
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  const post = await postRes.json();
  if (!post.id) throw new Error(`LI publish failed: ${JSON.stringify(post)}`);
  return { platformPostId: post.id };
}
```

- [ ] **Step 2: Verify type check**

Run: `npx tsc --noEmit` — clean exit.

- [ ] **Step 3: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/lib/social/publishers/linkedin.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): LinkedIn publisher via Marketing API ugcPosts"
```

---

### Task 12: TikTok publisher

**Files:**
- Create: `src/lib/social/publishers/tiktok.ts`

- [ ] **Step 1: Create `src/lib/social/publishers/tiktok.ts`**

```typescript
import { decrypt } from "../crypto";

interface PublishResult { platformPostId: string }

export async function publishToTikTok(
  encryptedAccessToken: string,
  imageUrl: string,
  caption: string,
): Promise<PublishResult> {
  const token = decrypt(encryptedAccessToken);

  const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/content/init/", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      post_info: {
        title: caption.slice(0, 90),
        description: caption,
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_comment: false,
        auto_add_music: true,
      },
      source_info: {
        source: "PULL_FROM_URL",
        photo_cover_index: 0,
        photo_images: [imageUrl],
      },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
    }),
  });
  const init = await initRes.json();
  const publishId = init?.data?.publish_id;
  if (!publishId) throw new Error(`TT init failed: ${JSON.stringify(init)}`);

  // TikTok publishes async. Poll status (max 60s).
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const status = await statusRes.json();
    if (status?.data?.status === "PUBLISH_COMPLETE") {
      return { platformPostId: publishId };
    }
    if (status?.data?.status === "FAILED") {
      throw new Error(`TT publish failed: ${JSON.stringify(status)}`);
    }
  }
  throw new Error(`TT publish timeout for ${publishId}`);
}
```

- [ ] **Step 2: Verify type check**

Run: `npx tsc --noEmit` — clean exit.

- [ ] **Step 3: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/lib/social/publishers/tiktok.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): TikTok image post publisher"
```

---

### Task 13: Publish dispatcher (route to correct publisher)

**Files:**
- Create: `src/lib/social/publishers/index.ts`

- [ ] **Step 1: Create `src/lib/social/publishers/index.ts`**

```typescript
import { publishToInstagram, publishToFacebook } from "./meta";
import { publishToLinkedIn } from "./linkedin";
import { publishToTikTok } from "./tiktok";

interface PublishArgs {
  platform: "instagram" | "facebook" | "linkedin" | "tiktok";
  encryptedAccessToken: string;
  platformAccountId: string;  // IG user id / FB page id / LI org id (TT ignores)
  imageUrl: string;
  body: string;
}

export async function publish(args: PublishArgs): Promise<{ platformPostId: string }> {
  switch (args.platform) {
    case "instagram":
      return publishToInstagram(args.encryptedAccessToken, args.platformAccountId, args.imageUrl, args.body);
    case "facebook":
      return publishToFacebook(args.encryptedAccessToken, args.platformAccountId, args.imageUrl, args.body);
    case "linkedin":
      return publishToLinkedIn(args.encryptedAccessToken, args.platformAccountId, args.imageUrl, args.body);
    case "tiktok":
      return publishToTikTok(args.encryptedAccessToken, args.imageUrl, args.body);
  }
}
```

- [ ] **Step 2: Verify type check + commit**

```bash
npx tsc --noEmit
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/lib/social/publishers/index.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): publish dispatcher"
```

> **Note:** `platformAccountId` was already added to `SocialAccount` in Task 1's schema, so no extra migration is needed here.

---

### Task 14: Engagement target builder (Node — hashtag + geo)

**Files:**
- Create: `src/lib/social/engagement/builder.ts`

- [ ] **Step 1: Create `src/lib/social/engagement/builder.ts`**

For v1, this seeds a **stub list of plausible target handles per hashtag** rather than scraping live (Graph hashtag search requires app review for IG/FB business endpoints, which is a separate compliance ask). The Python bot can also discover targets at engage-time. Use this as a deterministic feed for the queue builder.

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const HASHTAGS_PER_PLATFORM: Record<string, string[]> = {
  instagram: ["uberdriver", "doordash", "gigeconomy", "1099life", "rideshare", "instacartshopper", "lyftdriver"],
  facebook: ["uberdriver", "doordash", "gigworkers"],
  linkedin: ["gigeconomy", "fintech", "consumerlending", "futureofwork"],
  tiktok: ["uberdriver", "doordasher", "gigworker", "sidehustle"],
};

const DAILY_TARGETS_PER_PLATFORM: Record<string, { likes: number; follows: number }> = {
  instagram: { likes: 25, follows: 7 },
  facebook: { likes: 25, follows: 0 },
  linkedin: { likes: 20, follows: 0 },
  tiktok: { likes: 30, follows: 8 },
};

export async function buildEngagementQueue(): Promise<{ inserted: number }> {
  let inserted = 0;
  const now = new Date();

  for (const [platform, hashtags] of Object.entries(HASHTAGS_PER_PLATFORM)) {
    const caps = DAILY_TARGETS_PER_PLATFORM[platform];
    // Insert N like-targets per hashtag spread across the day.
    // Bot resolves the hashtag → real recent posters at engage-time.
    const likeTargets = caps.likes;
    const followTargets = caps.follows;

    for (let i = 0; i < likeTargets; i++) {
      const hashtag = hashtags[i % hashtags.length];
      await prisma.engagementTarget.create({
        data: {
          platform,
          source: `hashtag:#${hashtag}`,
          targetHandle: `__resolve_at_runtime__`, // bot picks handle from hashtag at engage-time
          action: "like",
          status: "queued",
        },
      });
      inserted++;
    }

    for (let i = 0; i < followTargets; i++) {
      const hashtag = hashtags[i % hashtags.length];
      await prisma.engagementTarget.create({
        data: {
          platform,
          source: `hashtag:#${hashtag}`,
          targetHandle: `__resolve_at_runtime__`,
          action: "follow",
          status: "queued",
        },
      });
      inserted++;
    }
  }

  return { inserted };
}
```

- [ ] **Step 2: Verify queue insertion**

Run:
```bash
DATABASE_URL="..." npx tsx -e "
import { buildEngagementQueue } from './src/lib/social/engagement/builder';
(async () => console.log(await buildEngagementQueue()))();
"
```

Expected: `{ inserted: 168 }` (25+25+20+30 likes + 7+0+0+8 follows).

Verify in Prisma Studio: `EngagementTarget` rows present, all `status=queued`, mix of `like` and `follow`, source like `hashtag:#uberdriver`.

- [ ] **Step 3: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/lib/social/engagement/builder.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): engagement target queue builder"
```

**Phase 3 shippable state:** All publishing + queue-building primitives are in place. Cron endpoints (Phase 4) wire them together.

---

## Phase 4 — Cron Endpoints

### Task 15: `POST /api/cron/social-rss`

**Files:**
- Create: `src/app/api/cron/social-rss/route.ts`

- [ ] **Step 1: Check existing cron auth pattern**

Read `src/app/api/cron/` directory. Existing endpoints likely use a `CRON_SECRET` env var via `Authorization: Bearer <secret>` header. Match that pattern.

Run: `ls src/app/api/cron/ && head -20 src/app/api/cron/*/route.ts | head -50`

- [ ] **Step 2: Create the route matching existing pattern**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { pollRssFeeds } from "@/lib/social/topics/rss";

export async function POST(req: NextRequest) {
  if (process.env.SOCIAL_BOT_ENABLED === "false") {
    return NextResponse.json({ skipped: "bot disabled" });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await pollRssFeeds();
  return NextResponse.json(result);
}
```

- [ ] **Step 3: Verify locally**

Start `npm run dev`. Then:
```bash
curl -X POST http://localhost:3000/api/cron/social-rss \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: `{"inserted": <n>, "total": <n>}`.

- [ ] **Step 4: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/app/api/cron/social-rss/
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): cron endpoint to poll RSS topics"
```

---

### Task 16: `POST /api/cron/social-targets`

**Files:**
- Create: `src/app/api/cron/social-targets/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { buildEngagementQueue } from "@/lib/social/engagement/builder";

export async function POST(req: NextRequest) {
  if (process.env.SOCIAL_BOT_ENABLED === "false") {
    return NextResponse.json({ skipped: "bot disabled" });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await buildEngagementQueue();
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Verify + commit**

```bash
curl -X POST http://localhost:3000/api/cron/social-targets \
  -H "Authorization: Bearer $CRON_SECRET"
# Expected: {"inserted": 168}

git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/app/api/cron/social-targets/
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): cron endpoint to build engagement queue"
```

---

### Task 17: `POST /api/cron/social-generate` (the main one)

**Files:**
- Create: `src/app/api/cron/social-generate/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { pickNextTopic } from "@/lib/social/topics/picker";
import { generatePostText } from "@/lib/social/generator/text";
import { generatePostImage } from "@/lib/social/generator/image";
import { checkBlocklist } from "@/lib/social/blocklist";
import { publish } from "@/lib/social/publishers";

const prisma = new PrismaClient();
const PLATFORMS = ["instagram", "facebook", "linkedin", "tiktok"] as const;

export async function POST(req: NextRequest) {
  if (process.env.SOCIAL_BOT_ENABLED === "false") {
    return NextResponse.json({ skipped: "bot disabled" });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary: Array<Record<string, unknown>> = [];

  for (const platform of PLATFORMS) {
    const account = await prisma.socialAccount.findUnique({
      where: { platform_handle: { platform, handle: "@pennylime" } },
    });
    if (!account || !account.accessToken) {
      summary.push({ platform, status: "no_account" });
      continue;
    }

    const topic = await pickNextTopic();
    if (!topic) {
      summary.push({ platform, status: "no_topic" });
      continue;
    }

    let body: string;
    let imageUrl: string;
    try {
      [body, imageUrl] = await Promise.all([
        generatePostText(topic.topic, platform),
        generatePostImage(topic.topic, platform),
      ]);
    } catch (err) {
      summary.push({ platform, status: "generation_failed", error: String(err) });
      continue;
    }

    const block = checkBlocklist(body);
    if (!block.passed) {
      await prisma.socialPost.create({
        data: {
          accountId: account.id,
          topic: topic.topic,
          body,
          imageUrl,
          scheduledFor: new Date(),
          status: "blocked",
          publishError: `blocklist: ${block.matches.join(", ")}`,
        },
      });
      summary.push({ platform, status: "blocked", matches: block.matches });
      continue;
    }

    const post = await prisma.socialPost.create({
      data: {
        accountId: account.id,
        topic: topic.topic,
        body,
        imageUrl,
        scheduledFor: new Date(),
        status: "pending",
      },
    });

    try {
      const { platformPostId } = await publish({
        platform,
        encryptedAccessToken: account.accessToken,
        platformAccountId: account.platformAccountId ?? "",
        imageUrl,
        body,
      });
      await prisma.socialPost.update({
        where: { id: post.id },
        data: { status: "published", platformPostId, publishedAt: new Date() },
      });
      summary.push({ platform, status: "published", platformPostId });
    } catch (err) {
      await prisma.socialPost.update({
        where: { id: post.id },
        data: { status: "failed", publishError: String(err) },
      });
      summary.push({ platform, status: "failed", error: String(err) });
    }
  }

  return NextResponse.json({ summary });
}
```

- [ ] **Step 2: Verify (dry-run with no creds — expect `no_account` for all 4)**

```bash
curl -X POST http://localhost:3000/api/cron/social-generate \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: 4 entries in summary, all `status: "no_account"` (since SocialAccount.accessToken is empty until Task 23 admin re-auth runs).

- [ ] **Step 3: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/app/api/cron/social-generate/
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): main cron endpoint to generate + publish posts"
```

---

### Task 18: `POST /api/cron/social-health`

**Files:**
- Create: `src/app/api/cron/social-health/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.socialAccount.findMany();
  const issues: Array<Record<string, unknown>> = [];
  const now = Date.now();

  for (const a of accounts) {
    if (a.botStatus !== "healthy") {
      issues.push({ platform: a.platform, handle: a.handle, issue: `bot ${a.botStatus}` });
    }
    if (a.tokenExpiresAt && a.tokenExpiresAt.getTime() - now < SEVEN_DAYS_MS) {
      issues.push({
        platform: a.platform,
        handle: a.handle,
        issue: `token expires ${a.tokenExpiresAt.toISOString()}`,
      });
    }
    if (!a.accessToken) {
      issues.push({ platform: a.platform, handle: a.handle, issue: "no token (needs auth)" });
    }
  }

  return NextResponse.json({ accounts: accounts.length, issues });
}
```

- [ ] **Step 2: Verify**

```bash
curl -X POST http://localhost:3000/api/cron/social-health \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: `{ accounts: 4, issues: [4 entries about no token] }`.

- [ ] **Step 3: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/app/api/cron/social-health/
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): health check endpoint for tokens + bot status"
```

**Phase 4 shippable state:** All cron endpoints exist, can be triggered manually. Once Meta/LI/TT credentials are pasted in Phase 5, posts can flow.

---

## Phase 5 — Admin UI (`/admin/social/`)

### Task 19: Add nav link + admin layout entry

**Files:**
- Modify: existing admin nav file (find first — likely `src/app/admin/layout.tsx` or a `nav.tsx` component)

- [ ] **Step 1: Locate and modify the nav**

Run: `grep -r "Pipeline\|Contacts\|SMS" src/app/admin/ -l | head -5` — find the nav file.

Add an entry: `{ href: "/admin/social", label: "Social" }` matching the existing nav structure.

- [ ] **Step 2: Commit (without page yet — page in next task)**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/app/admin/<nav-file>
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): add Social link to admin nav"
```

---

### Task 20: Dashboard page (`/admin/social`)

**Files:**
- Create: `src/app/admin/social/page.tsx`

- [ ] **Step 1: Create the dashboard**

```tsx
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";

export default async function SocialDashboard() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [accounts, todayPosts, todayLogs] = await Promise.all([
    prisma.socialAccount.findMany({ orderBy: { platform: "asc" } }),
    prisma.socialPost.findMany({
      where: { createdAt: { gte: today } },
      include: { account: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.engagementLog.groupBy({
      by: ["platform", "action"],
      where: { createdAt: { gte: today }, success: true },
      _count: true,
    }),
  ]);

  const unhealthy = accounts.filter((a) => a.botStatus !== "healthy" || !a.accessToken);

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold">Social Bot</h1>

      <section>
        <h2 className="text-lg font-semibold mb-2">Account Health</h2>
        <table className="w-full text-sm">
          <thead><tr><th className="text-left">Platform</th><th>Handle</th><th>Token</th><th>Bot</th></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className={a.botStatus !== "healthy" ? "text-red-600" : ""}>
                <td>{a.platform}</td>
                <td>{a.handle}</td>
                <td>{a.accessToken ? "✓" : "✗ no token"}</td>
                <td>{a.botStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Today's Posts</h2>
        {todayPosts.length === 0 ? <p className="text-gray-500">No posts yet today.</p> : (
          <ul className="space-y-2">
            {todayPosts.map((p) => (
              <li key={p.id} className="border p-3 rounded">
                <div className="text-xs text-gray-500">{p.account.platform} · {p.status}</div>
                <div className="font-medium">{p.topic}</div>
                {p.publishError && <div className="text-xs text-red-600 mt-1">{p.publishError}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Today's Engagement</h2>
        <table className="w-full text-sm">
          <thead><tr><th className="text-left">Platform</th><th>Action</th><th>Count</th></tr></thead>
          <tbody>
            {todayLogs.map((l, i) => (
              <tr key={i}><td>{l.platform}</td><td>{l.action}</td><td>{l._count}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Kill Switch</h2>
        <p className="text-sm text-gray-600">
          Set Railway env var <code>SOCIAL_BOT_ENABLED=false</code> on both <code>pennylime</code> and <code>pennylime-bot</code> services to stop all activity within ~5 minutes.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify it renders**

Visit `http://localhost:3000/admin/social` (after logging in to admin) — confirm 4 accounts shown, "no token" warnings, no posts yet, no engagement yet.

- [ ] **Step 3: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/app/admin/social/page.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): admin dashboard"
```

---

### Task 21: Posts list page (`/admin/social/posts`)

**Files:**
- Create: `src/app/admin/social/posts/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { PrismaClient } from "@prisma/client";
import Image from "next/image";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";

export default async function SocialPosts() {
  const posts = await prisma.socialPost.findMany({
    include: { account: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Generated Posts</h1>
      <ul className="space-y-4">
        {posts.map((p) => (
          <li key={p.id} className="border rounded p-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs text-gray-500">
                  {p.account.platform} · {p.createdAt.toLocaleString()} · <span className="font-medium">{p.status}</span>
                </div>
                <div className="font-medium">{p.topic}</div>
              </div>
              {p.platformPostId && (
                <a href={`#${p.platformPostId}`} className="text-blue-600 text-sm">platform ID: {p.platformPostId}</a>
              )}
            </div>
            {p.imageUrl && <img src={p.imageUrl} alt="" className="mt-2 max-w-xs rounded" />}
            <pre className="mt-2 text-sm whitespace-pre-wrap">{p.body}</pre>
            {p.publishError && (
              <div className="mt-2 text-sm text-red-600">Error: {p.publishError}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

Visit `/admin/social/posts` — confirm empty state renders.

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/app/admin/social/posts/
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): admin posts list page"
```

---

### Task 22: Topics CRUD (`/admin/social/topics`)

**Files:**
- Create: `src/app/admin/social/topics/page.tsx`
- Create: `src/app/admin/social/topics/actions.ts`

- [ ] **Step 1: Create server actions**

```typescript
// src/app/admin/social/topics/actions.ts
"use server";
import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

export async function addTopic(formData: FormData) {
  const topic = String(formData.get("topic") ?? "").trim();
  const category = String(formData.get("category") ?? "cashflow");
  if (!topic) return;
  await prisma.topicPool.create({ data: { topic, category } });
  revalidatePath("/admin/social/topics");
}

export async function toggleTopic(id: string) {
  const t = await prisma.topicPool.findUnique({ where: { id } });
  if (!t) return;
  await prisma.topicPool.update({ where: { id }, data: { active: !t.active } });
  revalidatePath("/admin/social/topics");
}
```

- [ ] **Step 2: Create the page**

```tsx
// src/app/admin/social/topics/page.tsx
import { PrismaClient } from "@prisma/client";
import { addTopic, toggleTopic } from "./actions";

const prisma = new PrismaClient();
export const dynamic = "force-dynamic";

export default async function SocialTopics() {
  const topics = await prisma.topicPool.findMany({
    orderBy: [{ active: "desc" }, { useCount: "asc" }],
  });

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Topic Pool</h1>

      <form action={addTopic} className="flex gap-2">
        <input name="topic" placeholder="New topic..." className="border p-2 flex-1 rounded" required />
        <select name="category" className="border p-2 rounded" defaultValue="cashflow">
          <option>tax</option><option>cashflow</option><option>platform-tips</option>
          <option>earnings</option><option>savings</option><option>news</option>
        </select>
        <button type="submit" className="bg-blue-600 text-white px-4 rounded">Add</button>
      </form>

      <table className="w-full text-sm">
        <thead><tr><th className="text-left">Topic</th><th>Category</th><th>Used</th><th>Last</th><th>Active</th><th></th></tr></thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t.id} className={t.active ? "" : "text-gray-400"}>
              <td>{t.topic}</td>
              <td>{t.category}</td>
              <td>{t.useCount}</td>
              <td>{t.lastUsedAt?.toLocaleDateString() ?? "-"}</td>
              <td>{t.active ? "✓" : "✗"}</td>
              <td>
                <form action={toggleTopic.bind(null, t.id)}>
                  <button type="submit" className="text-blue-600">toggle</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

Visit `/admin/social/topics` — confirm 50 topics render. Add one. Toggle one off. Refresh — state persists.

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/app/admin/social/topics/
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): admin topics CRUD"
```

---

### Task 23: Accounts page + manual creds entry (`/admin/social/accounts`)

**Files:**
- Create: `src/app/admin/social/accounts/page.tsx`
- Create: `src/app/admin/social/accounts/actions.ts`

- [ ] **Step 1: Create server action for paste-in creds**

```typescript
// src/app/admin/social/accounts/actions.ts
"use server";
import { PrismaClient } from "@prisma/client";
import { encrypt } from "@/lib/social/crypto";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

export async function saveCredentials(formData: FormData) {
  const id = String(formData.get("id"));
  const accessToken = String(formData.get("accessToken") ?? "").trim();
  const platformAccountId = String(formData.get("platformAccountId") ?? "").trim();
  const tokenExpiresInDays = Number(formData.get("tokenExpiresInDays") ?? "60");

  await prisma.socialAccount.update({
    where: { id },
    data: {
      accessToken: accessToken ? encrypt(accessToken) : "",
      platformAccountId: platformAccountId || undefined,
      tokenExpiresAt: accessToken
        ? new Date(Date.now() + tokenExpiresInDays * 24 * 60 * 60 * 1000)
        : undefined,
      botStatus: "healthy",
    },
  });
  revalidatePath("/admin/social/accounts");
}

export async function saveBotCookies(formData: FormData) {
  const id = String(formData.get("id"));
  const cookies = String(formData.get("cookies") ?? "").trim();
  await prisma.socialAccount.update({
    where: { id },
    data: { botCookies: cookies ? encrypt(cookies) : null, botStatus: "healthy" },
  });
  revalidatePath("/admin/social/accounts");
}
```

- [ ] **Step 2: Create the page**

```tsx
// src/app/admin/social/accounts/page.tsx
import { PrismaClient } from "@prisma/client";
import { saveCredentials, saveBotCookies } from "./actions";

const prisma = new PrismaClient();
export const dynamic = "force-dynamic";

export default async function SocialAccounts() {
  const accounts = await prisma.socialAccount.findMany({ orderBy: { platform: "asc" } });

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold">Social Accounts</h1>

      {accounts.map((a) => (
        <section key={a.id} className="border rounded p-4 space-y-4">
          <h2 className="font-semibold">{a.platform} · {a.handle}</h2>
          <div className="text-sm text-gray-500">
            Token: {a.accessToken ? `set (expires ${a.tokenExpiresAt?.toLocaleDateString() ?? "?"})` : "✗ missing"}
            {" · "} Bot: {a.botStatus}
            {a.botCookies && " · cookies set"}
          </div>

          <form action={saveCredentials} className="space-y-2">
            <input type="hidden" name="id" value={a.id} />
            <textarea name="accessToken" placeholder="paste access token" className="w-full border rounded p-2 font-mono text-xs" rows={2} />
            <input name="platformAccountId" placeholder="IG user id / FB page id / LI org id" className="w-full border rounded p-2" />
            <input name="tokenExpiresInDays" type="number" defaultValue={a.platform === "tiktok" ? 1 : 60} className="border rounded p-2 w-32" />
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Save credentials</button>
          </form>

          {(a.platform === "instagram" || a.platform === "facebook" || a.platform === "tiktok") && (
            <form action={saveBotCookies} className="space-y-2 border-t pt-4">
              <input type="hidden" name="id" value={a.id} />
              <label className="text-sm font-medium">Bot session cookies (for engagement bot)</label>
              <textarea name="cookies" placeholder="paste cookies blob from instagrapi/etc" className="w-full border rounded p-2 font-mono text-xs" rows={3} />
              <button type="submit" className="bg-gray-600 text-white px-4 py-2 rounded">Save bot cookies</button>
            </form>
          )}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

Visit `/admin/social/accounts` — confirm 4 sections render. Paste a fake token, save, verify on dashboard the "no token" warning clears.

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add src/app/admin/social/accounts/
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): admin accounts page with credential paste-in"
```

**Phase 5 shippable state:** Full admin works. Once you paste real Meta/LI/TT tokens, the next manual `social-generate` cron call publishes posts. **The posting half of the system is shippable here.**

---

## Phase 6 — Python Engagement Bot

### Task 24: Python service skeleton

**Files:**
- Create: `bot/Dockerfile`
- Create: `bot/pyproject.toml`
- Create: `bot/main.py` (stub)
- Create: `bot/db.py`

- [ ] **Step 1: Create `bot/pyproject.toml`**

```toml
[project]
name = "pennylime-bot"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "asyncpg>=0.29",
    "instagrapi>=2.1",
    "linkedin-api>=2.0",
    "TikTokApi>=6.0",
    "facebook-scraper>=0.2.59",
    "cryptography>=42.0",
    "python-dotenv>=1.0",
    "httpx>=0.27",
]
```

- [ ] **Step 2: Create `bot/Dockerfile`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml ./
RUN uv pip install --system -r pyproject.toml --no-cache
COPY . .
CMD ["python", "main.py"]
```

- [ ] **Step 3: Create `bot/db.py`**

```python
import os
import asyncpg
from typing import Optional

_pool: Optional[asyncpg.Pool] = None

async def pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        url = os.environ["DATABASE_URL"]
        # Railway internal URLs use postgres://, asyncpg accepts that.
        _pool = await asyncpg.create_pool(url, min_size=1, max_size=4)
    return _pool

async def fetch_queued_target(platform: str):
    p = await pool()
    return await p.fetchrow(
        """SELECT id, source, "targetHandle", "targetPostId", action
           FROM "EngagementTarget"
           WHERE platform = $1 AND status = 'queued'
           ORDER BY "createdAt" ASC LIMIT 1""",
        platform,
    )

async def mark_target(id: str, status: str):
    p = await pool()
    await p.execute(
        """UPDATE "EngagementTarget" SET status=$2, "processedAt"=NOW() WHERE id=$1""",
        id, status,
    )

async def get_account(platform: str):
    p = await pool()
    return await p.fetchrow(
        """SELECT id, "botCookies", "botStatus" FROM "SocialAccount"
           WHERE platform=$1 AND handle='@pennylime'""",
        platform,
    )

async def log_engagement(account_id: str, platform: str, action: str,
                          target_handle: str, target_post_id: Optional[str],
                          success: bool, error: Optional[str] = None):
    p = await pool()
    await p.execute(
        """INSERT INTO "EngagementLog" (id, "accountId", platform, action,
                                        "targetHandle", "targetPostId", success, error, "createdAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW())""",
        account_id, platform, action, target_handle, target_post_id, success, error,
    )

async def set_bot_status(account_id: str, status: str):
    p = await pool()
    await p.execute(
        """UPDATE "SocialAccount" SET "botStatus"=$2, "lastBotAction"=NOW() WHERE id=$1""",
        account_id, status,
    )
```

- [ ] **Step 4: Create stub `bot/main.py`**

```python
import asyncio
import os
import sys

async def main():
    if os.environ.get("SOCIAL_BOT_ENABLED", "true").lower() == "false":
        print("Bot disabled via SOCIAL_BOT_ENABLED=false")
        sys.exit(0)
    print("Bot starting (stub)...")
    while True:
        print("tick")
        await asyncio.sleep(60)

if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 5: Verify it builds locally**

```bash
cd bot && docker build -t pennylime-bot:dev .
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add bot/
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): Python bot service skeleton (Dockerfile, pyproject, db helper)"
```

---

### Task 25: Crypto + safety layer in Python

**Files:**
- Create: `bot/crypto.py`
- Create: `bot/safety.py`

- [ ] **Step 1: Create `bot/crypto.py` (mirror Node AES-GCM)**

```python
import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from cryptography.hazmat.backends import default_backend

SALT = b"pennylime-social-v1"

def _key() -> bytes:
    secret = os.environ["NEXTAUTH_SECRET"].encode("utf-8")
    kdf = Scrypt(salt=SALT, length=32, n=16384, r=8, p=1, backend=default_backend())
    return kdf.derive(secret)

def decrypt(payload: str) -> str:
    raw = base64.b64decode(payload)
    iv, tag, ct = raw[:12], raw[12:28], raw[28:]
    aesgcm = AESGCM(_key())
    plaintext = aesgcm.decrypt(iv, ct + tag, None)
    return plaintext.decode("utf-8")
```

- [ ] **Step 2: Create `bot/safety.py`**

```python
import asyncio
import random
from datetime import datetime, time, timezone

CAPS = {
    "instagram": {"like": 25, "follow": 7},
    "facebook":  {"like": 25, "follow": 0},
    "linkedin":  {"like": 20, "follow": 0},
    "tiktok":    {"like": 30, "follow": 8},
}

async def jitter():
    await asyncio.sleep(random.randint(45, 180))

def in_waking_hours() -> bool:
    # 12:00-04:00 UTC = 8am-12am US East
    h = datetime.now(timezone.utc).hour
    return h >= 12 or h < 4

async def daily_count(pool, account_id: str, action: str) -> int:
    row = await pool.fetchrow(
        """SELECT COUNT(*) AS n FROM "EngagementLog"
           WHERE "accountId"=$1 AND action=$2 AND success=true
             AND "createdAt" >= date_trunc('day', NOW() AT TIME ZONE 'UTC')""",
        account_id, action,
    )
    return row["n"] if row else 0

def under_cap(platform: str, action: str, count: int) -> bool:
    cap = CAPS.get(platform, {}).get(action, 0)
    return count < cap
```

- [ ] **Step 3: Verify python imports work**

```bash
cd bot && python -c "from crypto import decrypt; from safety import in_waking_hours, CAPS; print('ok', in_waking_hours(), CAPS)"
```

(Inside docker if Python deps not local: `docker run --rm -v $PWD:/app -w /app pennylime-bot:dev python -c '...'`.)

- [ ] **Step 4: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add bot/crypto.py bot/safety.py
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): bot crypto + safety/rate-limit module"
```

---

### Task 26: Instagram client (instagrapi wrapper)

**Files:**
- Create: `bot/clients/__init__.py`
- Create: `bot/clients/instagram.py`

- [ ] **Step 1: Create `bot/clients/__init__.py`** (empty file)

- [ ] **Step 2: Create `bot/clients/instagram.py`**

```python
import json
from instagrapi import Client
from instagrapi.exceptions import ChallengeRequired, LoginRequired, ClientError

class IGClient:
    def __init__(self, cookies_blob: str):
        self.cl = Client()
        settings = json.loads(cookies_blob)
        self.cl.set_settings(settings)
        self.cl.login_by_sessionid(settings.get("authorization_data", {}).get("sessionid", ""))

    def find_user_by_hashtag(self, hashtag: str) -> str | None:
        # Resolve a recent poster on this hashtag.
        try:
            medias = self.cl.hashtag_medias_recent(hashtag.lstrip("#"), amount=5)
            if not medias:
                return None
            chosen = medias[0]
            return chosen.user.username
        except (ClientError, ChallengeRequired, LoginRequired):
            raise

    def like_recent_post(self, username: str) -> bool:
        user_id = self.cl.user_id_from_username(username)
        medias = self.cl.user_medias(user_id, amount=1)
        if not medias:
            return False
        return self.cl.media_like(medias[0].id)

    def follow(self, username: str) -> bool:
        user_id = self.cl.user_id_from_username(username)
        return self.cl.user_follow(user_id)
```

- [ ] **Step 3: Verify import**

```bash
docker run --rm -v $PWD/bot:/app -w /app pennylime-bot:dev python -c "from clients.instagram import IGClient; print('ok')"
```

- [ ] **Step 4: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add bot/clients/__init__.py bot/clients/instagram.py
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): Instagram engagement client"
```

---

### Task 27: Facebook + LinkedIn + TikTok clients

**Files:**
- Create: `bot/clients/facebook.py`
- Create: `bot/clients/linkedin.py`
- Create: `bot/clients/tiktok.py`

- [ ] **Step 1: `bot/clients/facebook.py`**

```python
# Facebook engagement is severely limited on personal/page tokens.
# For v1, skip page-level "like other posts" — most attempts trigger
# checkpoints. Only stub with a noop that logs an explicit skip.

class FBClient:
    def __init__(self, cookies_blob: str):
        self.cookies_blob = cookies_blob

    def like_recent_post(self, username: str) -> bool:
        raise NotImplementedError("FB likes via cookie not supported in v1 — skipped")

    def follow(self, username: str) -> bool:
        raise NotImplementedError("FB page follows are not a meaningful action")
```

- [ ] **Step 2: `bot/clients/linkedin.py`**

```python
import json
from linkedin_api import Linkedin

class LIClient:
    def __init__(self, cookies_blob: str):
        creds = json.loads(cookies_blob)
        self.api = Linkedin(creds["username"], creds["password"], cookies=creds.get("cookies"))

    def like_recent_post(self, username: str) -> bool:
        # voyager LinkedIn API doesn't expose easy per-user post listing for orgs.
        # Search for the user's recent posts and like the first.
        posts = self.api.get_profile_posts(public_id=username, post_count=1)
        if not posts:
            return False
        urn = posts[0].get("urn")
        if not urn:
            return False
        self.api.react_to_post(urn, reaction_type="LIKE")
        return True

    def follow(self, username: str) -> bool:
        raise NotImplementedError("LinkedIn follows are out of scope per design")
```

- [ ] **Step 3: `bot/clients/tiktok.py`**

```python
from TikTokApi import TikTokApi

class TTClient:
    def __init__(self, cookies_blob: str):
        # TikTokApi requires browser session — cookies blob = cookies string from logged-in session
        self.cookies = cookies_blob

    async def like_recent_post(self, username: str) -> bool:
        async with TikTokApi() as api:
            await api.create_sessions(num_sessions=1, sleep_after=3, browser="chromium")
            user = api.user(username=username)
            async for video in user.videos(count=1):
                await video.info()
                # NOTE: TikTokApi v6+ does not support 'like' actions reliably.
                # This will raise NotImplementedError until a private endpoint shim is added.
                raise NotImplementedError("TikTok like via TikTokApi requires custom endpoint shim — TBD")
        return False

    async def follow(self, username: str) -> bool:
        raise NotImplementedError("TikTok follow requires custom endpoint shim — TBD")
```

> **Honest note:** TikTok and Facebook engagement automation is brittle/limited via open libraries. v1 ships with these clients raising `NotImplementedError` so the bot logs a `skipped` status for those targets. Bar should treat IG + LI as the only working engagement platforms in v1.

- [ ] **Step 4: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add bot/clients/facebook.py bot/clients/linkedin.py bot/clients/tiktok.py
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): FB/LI/TT engagement clients (LI live, FB+TT stubs for v1)"
```

---

### Task 28: Bot main loop

**Files:**
- Modify: `bot/main.py`

- [ ] **Step 1: Replace stub `bot/main.py` with the real loop**

```python
import asyncio
import os
import sys
import traceback
from datetime import datetime, timezone

from db import pool, fetch_queued_target, mark_target, get_account, log_engagement, set_bot_status
from safety import jitter, in_waking_hours, daily_count, under_cap
from crypto import decrypt

PLATFORMS = ["instagram", "facebook", "linkedin", "tiktok"]
POLL_INTERVAL_SECONDS = 30 * 60   # 30 min between sweeps
ACTIONS_PER_CYCLE = (1, 3)         # random per cycle

def get_client(platform: str, cookies_blob: str):
    if platform == "instagram":
        from clients.instagram import IGClient
        return IGClient(cookies_blob)
    if platform == "linkedin":
        from clients.linkedin import LIClient
        return LIClient(cookies_blob)
    if platform == "facebook":
        from clients.facebook import FBClient
        return FBClient(cookies_blob)
    if platform == "tiktok":
        from clients.tiktok import TTClient
        return TTClient(cookies_blob)
    raise ValueError(platform)

async def process_target(platform: str, target, account, cookies: str):
    client = get_client(platform, cookies)
    handle = target["targetHandle"]
    if handle == "__resolve_at_runtime__":
        # bot resolves a real handle from the source hashtag
        source = target["source"]
        if source.startswith("hashtag:#") and platform == "instagram":
            handle = client.find_user_by_hashtag(source.removeprefix("hashtag:#"))
            if not handle:
                await mark_target(target["id"], "skipped")
                return

    success = False
    error = None
    try:
        if target["action"] == "like":
            success = client.like_recent_post(handle) if platform != "tiktok" else await client.like_recent_post(handle)
        elif target["action"] == "follow":
            success = client.follow(handle) if platform != "tiktok" else await client.follow(handle)
    except NotImplementedError as e:
        await mark_target(target["id"], "skipped")
        await log_engagement(account["id"], platform, target["action"], handle, target["targetPostId"], False, str(e))
        return
    except Exception as e:
        error = type(e).__name__ + ": " + str(e)[:200]
        if "challenge_required" in str(e).lower():
            await set_bot_status(account["id"], "challenged")
        elif "rate" in str(e).lower():
            await asyncio.sleep(600)  # backoff 10 min on rate hit

    await mark_target(target["id"], "done" if success else "failed")
    await log_engagement(account["id"], platform, target["action"], handle, target["targetPostId"], success, error)

async def run_platform(platform: str):
    if not in_waking_hours():
        return

    account = await get_account(platform)
    if not account or not account["botCookies"] or account["botStatus"] != "healthy":
        return

    cookies = decrypt(account["botCookies"])
    p = await pool()

    import random
    n_actions = random.randint(*ACTIONS_PER_CYCLE)
    for _ in range(n_actions):
        target = await fetch_queued_target(platform)
        if not target:
            break

        # cap check
        count = await daily_count(p, account["id"], target["action"])
        if not under_cap(platform, target["action"], count):
            await mark_target(target["id"], "skipped")
            continue

        try:
            await process_target(platform, target, account, cookies)
        except Exception:
            traceback.print_exc()
        await jitter()

async def main_loop():
    while True:
        if os.environ.get("SOCIAL_BOT_ENABLED", "true").lower() == "false":
            print(f"[{datetime.now(timezone.utc).isoformat()}] disabled, sleeping 5min")
            await asyncio.sleep(300)
            continue

        print(f"[{datetime.now(timezone.utc).isoformat()}] sweep start")
        for platform in PLATFORMS:
            try:
                await run_platform(platform)
            except Exception:
                traceback.print_exc()
        await asyncio.sleep(POLL_INTERVAL_SECONDS)

if __name__ == "__main__":
    asyncio.run(main_loop())
```

- [ ] **Step 2: Verify locally (dry-run, will sleep on no targets)**

```bash
docker run --rm -e DATABASE_URL="$(railway variables -s pennylime --kv | grep DATABASE_PUBLIC_URL | cut -d= -f2-)" \
  -e NEXTAUTH_SECRET=test \
  -e SOCIAL_BOT_ENABLED=true \
  pennylime-bot:dev python main.py &
sleep 60 && kill %1
```

Expected: at least one "sweep start" log line. No crashes. (Will skip all platforms because no `botCookies` are set yet.)

- [ ] **Step 3: Commit**

```bash
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" add bot/main.py
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "feat(social): bot main loop with cap enforcement + jitter + waking hours"
```

**Phase 6 shippable state:** Bot service builds + runs. Real engagement happens once `botCookies` are pasted in admin for IG (and optionally LI).

---

## Phase 7 — Deployment + Kill Switch + Acceptance

### Task 29: Add `pennylime-bot` Railway service

**Files:**
- Create: `railway.toml` (if not exists) or via Railway dashboard

- [ ] **Step 1: Add a second service via Railway CLI**

Run:
```bash
cd ~/pennylime
railway service create pennylime-bot
```

Then in Railway dashboard:
- Source: same GitHub repo
- Root directory: `bot/`
- Builder: Dockerfile
- Variables (link from `pennylime` service):
  - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
  - `NEXTAUTH_SECRET=${{pennylime.NEXTAUTH_SECRET}}`
  - `SOCIAL_BOT_ENABLED=true`

- [ ] **Step 2: Trigger first deploy**

Push current branch — Railway picks up the new service. Verify in Railway dashboard that `pennylime-bot` shows "Deployed", logs show `sweep start` lines.

- [ ] **Step 3: No commit needed (config-only via Railway UI)**

---

### Task 30: Set up Railway cron triggers

- [ ] **Step 1: In Railway dashboard, on the `pennylime` service**

Add 4 cron triggers:
- `social-rss`: cron `0 13 * * *`, command `curl -X POST $RAILWAY_PUBLIC_DOMAIN/api/cron/social-rss -H "Authorization: Bearer $CRON_SECRET"`
- `social-targets`: cron `0 14 * * *`, same shape, endpoint `social-targets`
- `social-generate`: cron `0 15 * * *`, same shape, endpoint `social-generate`
- `social-health`: cron `0 6 * * *`, same shape, endpoint `social-health`

(If your existing PennyLime crons use a different mechanism — check `railway.toml` or existing setup — match that pattern.)

- [ ] **Step 2: Verify each cron fires**

In Railway logs, watch for the next scheduled cron to fire and the `pennylime` service to log the request. Confirm 200 responses.

- [ ] **Step 3: Add `SOCIAL_BOT_ENABLED` env var to `pennylime` service too**

Default `true`. Set to `false` to kill-switch.

---

### Task 31: Onboard real account credentials

- [ ] **Step 1: Get Meta credentials**

For IG + FB, do the FB Developer flow:
1. Create / link a Meta Business app at developers.facebook.com
2. Connect the `@pennylime` IG business account + FB page
3. Generate a long-lived page access token via Graph API Explorer
4. Get the IG business user ID (`/me/accounts` → look for `instagram_business_account.id`)
5. Get the FB page ID

In `/admin/social/accounts`, paste:
- Instagram: `accessToken` = page token, `platformAccountId` = IG business user ID, expires 60d
- Facebook: same `accessToken`, `platformAccountId` = FB page ID, expires 60d

- [ ] **Step 2: LinkedIn credentials**

1. Create a LinkedIn Marketing Developer Platform app
2. Request `w_organization_social` and `r_organization_social` scopes (requires Marketing Partner Program approval — or use personal OAuth for first 60 days)
3. Get an org URN (`urn:li:organization:XXXXX`)

In `/admin/social/accounts`:
- LinkedIn: `accessToken` = OAuth token, `platformAccountId` = org ID (digits only)

- [ ] **Step 3: TikTok credentials**

1. Apply to TikTok for Business Content Posting API
2. OAuth into the `@pennylime` TT account
3. Capture the access + refresh tokens

In `/admin/social/accounts`:
- TikTok: `accessToken` = OAuth access token, expires 1d (will need refresh logic — out of scope for v1, manual re-auth daily acceptable)

- [ ] **Step 4: IG bot session cookies**

For the engagement bot, Bar manually:
1. Logs into `@pennylime` IG on a desktop browser (or burner phone)
2. Uses `instagrapi`'s session export (one-liner Python script): `cl.login(USER, PASS); print(json.dumps(cl.get_settings()))`
3. Pastes the JSON blob into `/admin/social/accounts` Instagram bot cookies field

(LI bot: paste username/password JSON `{"username": "...", "password": "..."}`)

---

### Task 32: First end-to-end manual run

- [ ] **Step 1: Trigger generate cron manually**

```bash
curl -X POST https://pennylime.com/api/cron/social-generate \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected response: 4 entries in `summary` with `status: "published"` (or `blocked`/`failed` with explicit error). Verify on dashboard `/admin/social` that 4 posts appear in Today's Posts.

- [ ] **Step 2: Manually open each platform and confirm post is live**

Open IG, FB, LinkedIn, TikTok — confirm a `@pennylime` post exists for today.

- [ ] **Step 3: Trigger targets + watch bot**

```bash
curl -X POST https://pennylime.com/api/cron/social-targets \
  -H "Authorization: Bearer $CRON_SECRET"
```

In Railway logs for `pennylime-bot`, watch for the next 30-min sweep. Confirm `EngagementLog` rows appear in DB with `success=true` (at minimum for IG).

---

### Task 33: Kill switch verification

- [ ] **Step 1: Set the env var on both services**

In Railway dashboard, set `SOCIAL_BOT_ENABLED=false` on `pennylime` AND `pennylime-bot`.

- [ ] **Step 2: Trigger generate cron manually**

```bash
curl -X POST https://pennylime.com/api/cron/social-generate \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: `{"skipped": "bot disabled"}`.

- [ ] **Step 3: Watch bot logs**

Within 5 min, `pennylime-bot` logs should print `disabled, sleeping 5min`.

- [ ] **Step 4: Re-enable**

Set `SOCIAL_BOT_ENABLED=true` on both services. Verify next sweep resumes normally.

---

### Task 34: 7-day soak

- [ ] **Step 1: Let it run for 7 days**

Each morning, check `/admin/social` for:
- Today's Posts: 4 entries, all `status: published`
- Today's Engagement: counts climbing toward daily caps for IG (+ LI likes)
- Account Health: all 4 accounts `healthy`, no challenge alerts

- [ ] **Step 2: Watch for failure modes**

If you see:
- `botStatus: challenged` on IG → re-cookie via admin (5 min)
- Token expiry warnings 7d out → re-auth via admin
- Repeated `failed` posts → check `publishError` in admin posts list

- [ ] **Step 3: After 7 days clean operation, the project is "done"**

Update spec with any lessons learned (e.g., TikTok image posts get suppressed → drop TikTok, etc.).

**Phase 7 shippable state:** Production system live, monitored, kill-switchable.

---

## Out-of-scope reminders (do NOT add in v1)

- ❌ TikTok video generation
- ❌ Reply / DM automation
- ❌ Story / Reel posting
- ❌ Multi-account / personality accounts
- ❌ A/B testing
- ❌ Paid ads automation
- ❌ Competitor-follower scraping (banned per spec section 6.3)

If any of these come up during implementation, surface to Bar — do not silently add.
