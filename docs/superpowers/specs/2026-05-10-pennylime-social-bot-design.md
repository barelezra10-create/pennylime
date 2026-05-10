# PennyLime Social Bot — Design Spec

**Date:** 2026-05-10
**Owner:** Bar Elezra
**Project:** PennyLime (`~/pennylime`)
**Status:** Approved (brainstorm) — pending implementation plan

---

## 1. Overview

A fully autonomous social media presence system for PennyLime on Instagram, Facebook, LinkedIn, and TikTok. The system generates 1 educational post per day per platform on cash-flow management and gig-work topics, and runs an engagement bot that performs likes and follows within conservative daily caps targeted at gig-economy audiences (rideshare and delivery drivers).

**Audience reminder:** PennyLime is a cash advance product for gig workers (Uber, Lyft, DoorDash, Instacart, Grubhub, etc.), not a generic personal loan portal. Content angle is gig-work tips and variable-income cash flow management.

### 1.1 Goals

- **Lead gen** — drive profile visits and bio-link clicks to `pennylime.com/apply`.
- **Brand presence** — maintain a credible active social footprint so users who Google PennyLime see active accounts.
- **Audience building** — grow followers on each platform over months.

All four platforms pull double duty for these three goals.

### 1.2 Non-goals

- Reply automation (auto-replying to comments or DMs)
- Story / Reel / Short video generation
- Multi-account or personality-account farms (single branded account per platform)
- A/B testing posts
- Paid ads or boost automation
- Analytics beyond "did the post publish" + "is the bot healthy"

### 1.3 Account map

| Platform | Account | Posts/day | Likes/day | Follows/day |
|---|---|---|---|---|
| Instagram | `@pennylime` | 1 | 25 | 7 |
| Facebook | `@pennylime` | 1 | 25 | 0 (page follows aren't a thing) |
| LinkedIn | `@pennylime` | 1 | 20 | 0 (likes only by design) |
| TikTok | `@pennylime` | 1 | 30 | 8 |

LinkedIn uses a more company/product-focused tone (B2B). The other three use the gig-worker tips angle.

---

## 2. Architecture

### 2.1 Repo layout (monorepo in `~/pennylime`)

```
~/pennylime/
  src/
    app/
      admin/
        social/                      ← NEW: dashboard, posts list, topics CRUD, accounts
      api/
        cron/
          social-rss/route.ts        ← NEW
          social-targets/route.ts    ← NEW
          social-generate/route.ts   ← NEW
          social-health/route.ts     ← NEW
    lib/
      social/                        ← NEW: see Section 4
  bot/                               ← NEW: Python engagement bot
    Dockerfile
    main.py
    pyproject.toml
    clients/
    safety.py
    db.py
  prisma/
    schema.prisma                    ← +5 new models
```

### 2.2 Railway services

Two services in the existing PennyLime Railway project, sharing the existing Postgres:

1. **`pennylime`** (existing Next.js) — content generation, official-API posting, admin UI, cron triggers
2. **`pennylime-bot`** (NEW Python) — engagement bot (likes/follows via unofficial libraries), reads target list from shared Postgres, writes results back

### 2.3 Data flow

```
Daily 13:00 UTC → POST /api/cron/social-rss
  → poll RSS feeds, insert trending topics into TopicPool

Daily 14:00 UTC → POST /api/cron/social-targets
  → build EngagementTarget queue (~60/day across platforms)

Daily 15:00 UTC → POST /api/cron/social-generate
  → for each platform: pick topic → Gemini text+image → blocklist check
  → if pass: publish via official API, save SocialPost(status=published)
  → if fail blocklist: save SocialPost(status=blocked), skip

Every 30 min, 12:00–04:00 UTC → pennylime-bot polls EngagementTarget
  → process 1–3 actions per cycle with random jitter
  → log to EngagementLog
  → on rate_limit/challenge: backoff or pause account 24h

Daily 06:00 UTC → POST /api/cron/social-health
  → check token expiry, surface in admin if expiring <7 days or any account challenged/banned
```

---

## 3. Data Model

5 new models added to `prisma/schema.prisma`:

```prisma
model SocialAccount {
  id             String         @id @default(cuid())
  platform       String         // "instagram" | "facebook" | "linkedin" | "tiktok"
  handle         String         // "@pennylime"
  accessToken    String         // encrypted at rest (AES-GCM via NEXTAUTH_SECRET)
  refreshToken   String?
  tokenExpiresAt DateTime?
  botCookies     String?        // encrypted instagrapi/cookie session blob
  botStatus      String         @default("healthy") // "healthy" | "challenged" | "banned"
  lastBotAction  DateTime?
  createdAt      DateTime       @default(now())

  posts          SocialPost[]
  engagements    EngagementLog[]

  @@unique([platform, handle])
}

model SocialPost {
  id             String         @id @default(cuid())
  accountId      String
  account        SocialAccount  @relation(fields: [accountId], references: [id])
  topic          String
  body           String         // caption text
  imageUrl       String?        // Gemini-generated image (R2 or Railway volume)
  scheduledFor   DateTime
  status         String         @default("pending") // "pending"|"published"|"failed"|"blocked"
  platformPostId String?        // ID returned by IG/FB/LI/TT after publish
  publishError   String?
  publishedAt    DateTime?
  createdAt      DateTime       @default(now())

  @@index([status, scheduledFor])
}

model TopicPool {
  id         String    @id @default(cuid())
  topic      String    // "How to track Uber expenses for taxes"
  category   String    // "tax" | "cashflow" | "platform-tips" | "earnings" | "savings" | "news"
  lastUsedAt DateTime?
  useCount   Int       @default(0)
  active     Boolean   @default(true)
}

model EngagementTarget {
  id           String    @id @default(cuid())
  platform     String
  source       String    // "hashtag:#uberdriver" | "geo:los-angeles+keyword:doordash"
  targetHandle String    // user to like/follow
  targetPostId String?   // specific post to like (null = follow only)
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
  error        String?       // "rate_limited" | "challenge_required" | "banned" | etc.
  createdAt    DateTime      @default(now())

  @@index([accountId, createdAt])
}
```

**Rationale:**
- `SocialAccount` is the single source of truth for credentials. Both Node and Python services read/write it. Tokens encrypted at rest using AES-GCM with key derived from existing `NEXTAUTH_SECRET`.
- `SocialPost` tracks the post lifecycle and is the source for the admin dashboard.
- `TopicPool` prevents repetition via `lastUsedAt` round-robin and `useCount` capping.
- `EngagementTarget` is the queue the Python bot consumes — Node generator writes, Python bot reads + marks done. Decouples the two services and lets the bot retry independently.
- `EngagementLog` is the audit trail and powers the bot health view.

---

## 4. Components

### 4.1 Node side (`src/lib/social/`)

| Module | Purpose |
|---|---|
| `topics/seeder.ts` | One-time script to populate `TopicPool` with ~200 starter topics across categories `tax`, `cashflow`, `platform-tips`, `earnings`, `savings`. Run once at deploy via `npm run seed:topics`. |
| `topics/rss.ts` | Polls 4 RSS feeds (The Rideshare Guy, Gridwise blog, BLS gig releases, Reddit r/uberdrivers top weekly), inserts trending topics with `category=news`. Triggered by `/api/cron/social-rss` daily at 13:00 UTC. |
| `generator/post.ts` | `generatePost(topic, platform)` → calls Gemini text + Gemini image, returns `{body, imageUrl}`. Platform-aware prompts produce the right aspect ratio and tone (TikTok 9:16, IG square, LinkedIn 1.91:1, Facebook 1200×630). LinkedIn variant uses company/product tone. |
| `generator/blocklist.ts` | Hardcoded forbidden-term filter ("guaranteed", "no credit check", "instant approval", APR-specific claims, state-restricted terms). Returns `{passed: bool, matches: string[]}`. Failed posts stored with `status=blocked` and skipped. |
| `publishers/meta.ts` | Posts to IG + FB via Meta Graph API v22 using long-lived page tokens. |
| `publishers/linkedin.ts` | Posts to LinkedIn via Marketing API (`/v2/ugcPosts` endpoint). |
| `publishers/tiktok.ts` | Posts via TikTok Content Posting API in image post format (no video in v1). |
| `engagement/builder.ts` | Builds the `EngagementTarget` queue daily: pulls hashtag posts via official Graph hashtag search where available, plus geo+keyword targets, deduplicates against `EngagementLog`, inserts ~60 targets/day. |
| `crypto.ts` | AES-GCM encrypt/decrypt for tokens + bot cookies, key derived from `NEXTAUTH_SECRET`. |

### 4.2 Python side (`bot/`)

| Module | Purpose |
|---|---|
| `main.py` | Entrypoint. Polls `EngagementTarget` table every 5 min, processes one platform at a time. |
| `clients/instagram.py` | Wraps `instagrapi`. Loads session cookies from `SocialAccount.botCookies`, refreshes on challenge. |
| `clients/facebook.py` | Wraps `facebook_scraper` for likes. Page follows are not a meaningful action on FB. |
| `clients/linkedin.py` | Uses `linkedin-api` (voyager). Likes only by design. |
| `clients/tiktok.py` | Uses `TikTokApi`. Likes + follows. |
| `safety.py` | Rate limiter, exponential backoff, daily caps per `SocialAccount`. Detects `challenge_required`/`rate_limited` errors → marks `botStatus=challenged`, pauses account 24h. |
| `db.py` | Direct Postgres connection via `DATABASE_URL`. Use `asyncpg`. |

### 4.3 Admin UI (`src/app/admin/social/`)

Lives alongside existing `/admin/sms/`, `/admin/email/`, `/admin/content/` admin sections.

| Page | Purpose |
|---|---|
| `/admin/social` | Dashboard: today's published posts (with platform links), engagement stats per account, bot health (any account `botStatus != healthy`?), kill-switch button. |
| `/admin/social/posts` | Read-only list of all generated posts with status. Click row → see body, image, platform link, error if failed. |
| `/admin/social/topics` | CRUD on `TopicPool` — add/disable topics. |
| `/admin/social/accounts` | List `SocialAccount` rows + bot status + manual "re-auth" button (kicks off OAuth for Meta/LinkedIn, manual cookie paste flow for IG bot session). |

No write actions on posts (per fully-autonomous design) — admin is read-only except for topics + accounts.

---

## 5. Cron Schedule + Daily Caps

### 5.1 Cron jobs (Railway cron triggers, all UTC)

| Time | Endpoint / Service | Action |
|---|---|---|
| `13:00` daily | `POST /api/cron/social-rss` | Pull RSS feeds → insert trending topics |
| `14:00` daily | `POST /api/cron/social-targets` | Build engagement queue (~60 targets across 4 platforms) |
| `15:00` daily | `POST /api/cron/social-generate` | Generate 4 posts (1 per platform), publish if blocklist passes |
| `*/30 * * * *` (12:00–04:00 UTC = 8am–12am ET) | `pennylime-bot` polls DB | Process engagement queue, ~3-5 actions per cycle |
| `06:00` daily | `POST /api/cron/social-health` | Check token expiry, surface in admin if any account is challenged/banned or token expires <7 days |

### 5.2 Daily caps (hardcoded in `safety.py`)

| Platform | Likes/day | Follows/day | Posts/day |
|---|---|---|---|
| Instagram | 25 | 7 | 1 |
| Facebook | 25 | 0 | 1 |
| LinkedIn | 20 | 0 | 1 |
| TikTok | 30 | 8 | 1 |

### 5.3 Rate-limiting + safety rules

- Random jitter between actions: 45–180 seconds (no two actions within 30s).
- Random session length: 1–3 actions per cycle, not a fixed N.
- Hard stop on `challenge_required` → mark `botStatus=challenged`, pause account 24h, surface in admin.
- Hard stop on `rate_limited` → exponential backoff (10min, 30min, 2h, 6h).
- No engagement activity outside 12:00–04:00 UTC (= waking hours US East).
- Re-auth alert in admin 7 days before token expiry.

### 5.4 Token lifetimes

- Meta page tokens: 60 days, must refresh.
- LinkedIn: 60 days, no refresh — full re-auth required.
- TikTok: 24h access, 365-day refresh — auto-refreshable.
- Bot cookies (instagrapi etc.): no formal expiry, dies on challenge.

---

## 6. Targeting Strategy

Engagement targets come from two sources, mixed by `engagement/builder.ts`:

### 6.1 Hashtag-based

- IG/FB: query Graph hashtag search for recent posts under `#uberdriver`, `#doordash`, `#gigeconomy`, `#1099life`, `#rideshare`, `#instacartshopper`, etc.
- TikTok: query Content Posting API hashtag endpoint.
- LinkedIn: pull recent posts under hashtags `#gigeconomy`, `#fintech`, `#consumerlending`.

### 6.2 Geo + keyword

- Target accounts posting recently from US gig hubs (LA, NYC, Houston, Phoenix, Atlanta, Chicago, Miami, Dallas) using gig keywords.
- Slowest source but most human-looking pattern.

### 6.3 Excluded by design

- ❌ Competitor-follower scraping (Earnin, Dave, Gridwise, Brigit, MoneyLion). Highest ban-risk pattern; explicitly out of scope.

---

## 7. Content Strategy

### 7.1 Topic seeding

`TopicPool` is seeded once with ~200 topics across these categories:

- `tax` — quarterly estimated tax tips, mileage tracking, deduction guides
- `cashflow` — managing variable income, smoothing peak/slow weeks, budgeting on irregular pay
- `platform-tips` — surge strategies, app comparison, rating protection, multi-app stacking
- `earnings` — hourly rate optimization, best times to drive/dash, fuel cost management
- `savings` — emergency fund building on gig income, side-hustle stacking

### 7.2 RSS-seeded `news` category

Daily poll of:
- The Rideshare Guy blog
- Gridwise blog
- BLS gig economy releases
- Reddit r/uberdrivers top weekly

Items deduplicated by URL. Stored as `category=news` topics with shorter `useCount` cap.

### 7.3 LinkedIn variant

LinkedIn posts use a separate prompt template emphasizing PennyLime as a company (mission, traction, fintech innovation, gig-worker financial inclusion). Topic still drawn from same pool but reframed.

### 7.4 Compliance blocklist

Hardcoded forbidden terms (non-exhaustive starting list):
- "guaranteed", "guaranteed approval"
- "no credit check"
- "instant approval"
- "no fees" (we have fees)
- Specific APR claims
- Specific dollar amounts in headlines (varies by state)

Posts containing any term → `status=blocked`, skipped, logged.

---

## 8. Risks + Mitigations

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | `@pennylime` IG gets `challenge_required` within 4–8 weeks | ~70% in 90 days | Bot pauses on first challenge; manual re-cookie flow (5 min via mobile login → cookie export) |
| 2 | Meta restricts FB/IG page for unauthorized financial services advertising | medium | Blocklist filters product/promo language; first 30 days = 100% educational content, no PennyLime mentions in body, link in bio only |
| 3 | LinkedIn voyager API breaks | 1–2 breakages/year | LinkedIn engagement is likes-only; if it breaks, posting (official API) keeps working |
| 4 | TikTok image posts get suppressed in feed | medium | Monitor TikTok view counts; if <100 views avg after 30 days, drop TikTok posting |
| 5 | Gemini generates compliance-violating caption | medium | Blocklist filter is the safety net; `status=blocked`, no human review per design |

---

## 9. Kill Switch

- Add `SOCIAL_BOT_ENABLED` env var on both Railway services.
- Both services check it on every cron tick / poll cycle.
- Flipping the env var stops everything within 5 minutes.
- Surfaced in `/admin/social` dashboard as a "Pause everything" button that flips the Railway env var via Railway API.

---

## 10. Acceptance Criteria

- [ ] 4 cron jobs run on schedule, generate + publish 1 post/day per platform.
- [ ] Bot service runs every 30 min during waking hours, stays under daily caps.
- [ ] Admin dashboard at `/admin/social` shows today's posts + bot health.
- [ ] Manual re-auth flow works for all 4 platforms.
- [ ] Kill switch verified to stop all activity within 5 min.
- [ ] 7 days of clean operation in production with no `challenge_required` or `rate_limited` errors.

---

## 11. Out of Scope (Explicit Non-Goals)

- ❌ TikTok video generation (would need Veo/Runway, separate project).
- ❌ Reply automation (auto-replying to comments/DMs).
- ❌ Story posting (IG Stories, FB Stories).
- ❌ Multi-account / personality accounts.
- ❌ A/B testing posts.
- ❌ Paid boost / ads automation.
- ❌ Analytics beyond "did the post publish" + "is the bot healthy".
- ❌ Competitor-follower scraping (highest ban-risk pattern).
