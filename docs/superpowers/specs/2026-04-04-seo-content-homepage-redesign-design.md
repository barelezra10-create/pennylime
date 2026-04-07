# LimeCredit SEO Content System & Homepage Redesign

**Date:** 2026-04-04
**Status:** Approved

---

## 1. Overview

Two workstreams for LimeCredit (loan-portal):

1. **SEO Content System** — Admin CMS, 5 content types, ~100-130 pages of generated content, full technical SEO infrastructure
2. **Homepage Redesign** — GSAP ScrollTrigger pinned-scroll sections with hand-drawn/organic AI-generated illustrations via Gemini API

All content lives on the same domain (limecredit.com). Content is managed through the existing admin panel.

---

## 2. Content Types & Data Model

### 2.1 Content Models

Five Prisma models, each with tailored fields:

**Article** (~30-40 pages)
- URLs: `/blog/[slug]`
- Fields: `title`, `slug`, `body` (rich HTML from Tiptap), `excerpt`, `featuredImage`, `categoryId`, `publishedAt`, `published`
- Relations: belongs to Category, has many Tags via ArticleTag join table
- Examples: "Best Loans for Gig Workers in 2026", "How to Get a Loan With 1099 Income", "5 Tax Tips for Uber Drivers"

**PlatformPage** (~14 pages)
- URLs: `/loans-for-[slug]` (e.g. `/loans-for-uber-drivers`)
- Fields: `platformName`, `slug`, `heroHeadline`, `heroSubtext`, `platformDescription`, `avgEarnings`, `topEarnerRange`, `loanDetailsHtml`, `faqEntries` (JSON array of {question, answer}), `ctaText`, `ctaSubtext`, `published`
- Covers: Uber, Lyft, DoorDash, Instacart, Amazon Flex, Grubhub, Postmates, Fiverr, Upwork, TaskRabbit, Shipt, Turo, Rover, Thumbtack

**StatePage** (~50 pages)
- URLs: `/1099-loans-[slug]` (e.g. `/1099-loans-california`)
- Fields: `stateName`, `stateCode`, `slug`, `heroHeadline`, `heroSubtext`, `regulationsSummary`, `loanAvailability`, `localStats` (JSON), `faqEntries` (JSON array), `ctaText`, `published`
- All 50 US states

**ToolPage** (~5-10 pages)
- URLs: `/tools/[slug]` (e.g. `/tools/loan-calculator`)
- Fields: `title`, `slug`, `description`, `toolComponent` (string identifier mapping to a React component), `body` (optional rich text below tool), `relatedArticleSlugs` (JSON array), `published`
- Examples: Loan Calculator, Income Estimator, Loan Comparison Tool, Debt-to-Income Calculator, Gig Tax Estimator

**ComparisonPage** (~5-10 pages)
- URLs: `/compare/[slug]` (e.g. `/compare/limecredit-vs-fundo`)
- Fields: `title`, `slug`, `entityA`, `entityB`, `introHtml`, `comparisonGrid` (JSON array of {feature, entityAValue, entityBValue}), `verdict`, `faqEntries` (JSON array), `published`
- Examples: LimeCredit vs Fundo, LimeCredit vs traditional bank loans, LimeCredit vs MCA providers

### 2.2 Shared SEO Fields

Every content model includes:
- `metaTitle` (String, max 60 chars)
- `metaDescription` (String, max 160 chars)
- `ogImage` (String, optional — path to uploaded image)
- `canonicalUrl` (String, optional)
- `noIndex` (Boolean, default false)

### 2.3 Supporting Models

**Category**
- Fields: `name`, `slug`, `description`
- Seed values: Guides, Platform Tips, Loan Education, News, Tax & Finance

**Tag**
- Fields: `name`, `slug`
- Join table: `ArticleTag` (articleId, tagId)

**ContentImage**
- Fields: `fileName`, `mimeType`, `fileSize`, `storagePath`, `altText`, `createdAt`
- Used by the image library in admin and inline article images

---

## 3. URL Structure

### 3.1 Public Routes

```
/blog                              → Article index (paginated, filterable)
/blog/[slug]                       → Individual article
/blog/category/[slug]              → Category archive
/loans-for-[slug]                  → Platform landing pages
/1099-loans-[slug]                 → State pages
/tools/[slug]                      → Tool pages
/compare/[slug]                    → Comparison pages
/sitemap.xml                       → Dynamic sitemap
/robots.txt                        → Robots file
```

### 3.2 Admin Routes

```
/admin/content                     → Content dashboard (counts, recent edits)
/admin/content/articles            → Article list + create/edit
/admin/content/platforms           → Platform page list + create/edit
/admin/content/states              → State page list + create/edit
/admin/content/tools               → Tool page list + create/edit
/admin/content/comparisons         → Comparison page list + create/edit
/admin/content/categories          → Category & tag management
/admin/content/images              → Image library (upload, browse, delete)
```

---

## 4. SEO Infrastructure

### 4.1 Technical SEO

**robots.txt** (static file in /public or generated route):
```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /status
Sitemap: https://limecredit.com/sitemap.xml
```

**sitemap.xml** (dynamic Next.js route):
- Auto-generated from all published content across all 5 types
- Includes static pages: /, /apply, /privacy, /terms, /disclosures
- Includes `lastmod` from `updatedAt` field
- Regenerated on content publish/unpublish via revalidation

**Canonical URLs:**
- Auto-set to the page's own URL unless explicitly overridden in CMS

### 4.2 Structured Data (JSON-LD)

Per page type:
- **Homepage:** `Organization` + `LoanOrCredit`
- **Articles:** `Article` with `author`, `datePublished`, `dateModified`, `publisher`
- **Platform pages:** `LoanOrCredit` + `FAQPage`
- **State pages:** `LoanOrCredit` + `FAQPage`
- **Tool pages:** `WebApplication`
- **Comparison pages:** `FAQPage`
- **All pages:** `BreadcrumbList`

### 4.3 Meta Tags

Every page renders:
- `<title>` from metaTitle (fallback: generated from content title + "| LimeCredit")
- `<meta name="description">` from metaDescription
- `<meta property="og:title">`, `og:description`, `og:image`, `og:url`, `og:type`
- `<meta name="twitter:card">` (summary_large_image), `twitter:title`, `twitter:description`, `twitter:image`
- `<link rel="canonical">`

### 4.4 On-Page SEO Features

- **Breadcrumbs** on all content pages (Home > Blog > Article Title)
- **Table of Contents** auto-generated from H2/H3 headings in articles
- **Related Content** section at bottom of every page (3-4 related articles/pages)
- **Internal linking** — platform pages link to related articles, state pages cross-link to nearby states, articles link to relevant tools
- **FAQ sections** with expandable accordions and FAQPage schema

### 4.5 Performance

- `generateStaticParams` for all published content at build time
- ISR with `revalidatePath` triggered when content is published/updated from admin
- `next/image` for all content images with proper sizing and lazy loading

---

## 5. Admin Content Editor

### 5.1 Article Editor

- **Tiptap** rich text editor (open source, React-native, extensible)
- Toolbar: H2, H3, bold, italic, link, image (inline upload or pick from library), bullet list, numbered list, blockquote, code block, horizontal rule
- **Left panel:** Editor (full width)
- **Right sidebar:** SEO fields (meta title with char count, meta description with char count, OG image upload), category dropdown, tag multi-select, slug (auto-generated, editable), publish toggle, publish date picker, excerpt textarea
- **Preview button:** Opens rendered page in new tab

### 5.2 Structured Page Editors (Platform, State, Comparison)

Form-based editors with labeled fields matching the model:

**Platform page form:**
- Platform Name (text)
- Slug (auto-generated)
- Hero Headline (text)
- Hero Subtext (textarea)
- Platform Description (textarea)
- Avg Earnings (text, e.g. "$45,000/yr")
- Top Earner Range (text, e.g. "$80,000-$120,000/yr")
- Loan Details (small rich text)
- FAQ Entries (repeatable: question + answer pairs, add/remove/reorder)
- CTA Text, CTA Subtext
- SEO fields sidebar (same as articles)
- Publish toggle

**State page form:** Similar structure with state-specific fields (state name, state code, regulations summary, local stats as key-value pairs).

**Comparison page form:** Entity A name, Entity B name, intro (rich text), comparison grid (repeatable rows: feature, A value, B value), verdict (textarea), FAQ entries.

### 5.3 Tool Page Editor

- Title, slug, description
- Tool Component selector (dropdown of available interactive components)
- Optional body text (Tiptap editor) for content below the tool
- Related article slugs (multi-select from existing articles)
- SEO fields sidebar

### 5.4 Content List Views

Table with columns: Title, Type, Status (Published/Draft badge), Category (articles only), Published Date, Last Edited. Sortable by any column. Search by title. Filter by status, category.

### 5.5 Image Library

Grid view of uploaded images. Upload button (drag & drop or file picker). Each image shows: thumbnail, filename, alt text (editable), dimensions, file size. Click to copy path for use in editor.

---

## 6. Homepage Redesign

### 6.1 Technology

- **GSAP** (GreenSock Animation Platform) + **ScrollTrigger** plugin for pinned scroll sections
- Replace current Framer Motion animations with GSAP
- Hand-drawn/organic style illustrations generated via **Gemini API** (imagen model)

### 6.2 Illustration Style

**Hand-drawn/organic aesthetic:**
- Warm, sketchy line art with imperfect strokes
- Muted color palette: sage greens, warm creams, soft charcoal outlines
- Subjects: gig workers (delivery riders, freelancers at laptops, drivers), money/growth imagery, phones/apps
- Style reference: approachable, human, anti-corporate — like Mailchimp's old illustration style or Notion's hand-drawn elements
- Generated via Gemini API imagen model, stored in /public/illustrations/

### 6.3 Homepage Sections (Scroll Sequence)

The homepage is a linear pinned-scroll experience. Each section pins to the viewport while its content animates, then unpins and scrolls away.

**Section 1: Hero (pinned)**
- Full viewport. LimeCredit logo + tagline "Get funded. Keep moving."
- Hand-drawn illustration of a gig worker on a bike, phone in hand
- CTA buttons fade in: "Get Funded Now" / "Check Status"
- On scroll: illustration elements draw themselves in (stroke animation)
- Unpin trigger: after draw animation completes

**Section 2: The Problem (pinned)**
- Split layout: left text, right illustration
- Text: "Banks don't get gig work." Stats about 73% of gig workers denied traditional loans
- Illustration: hand-drawn sketch of a closed bank door with a gig worker outside
- On scroll: text slides in from left, illustration sketches in from right
- Unpin after content is fully visible

**Section 3: How It Works (pinned, 3-step sequence)**
- Single pinned section that cycles through 3 steps as user scrolls:
  1. "Apply in 5 minutes" — illustration of someone filling a form on phone
  2. "We check your earnings, not your credit" — illustration of bank statements with a green checkmark
  3. "Cash hits your account" — illustration of money flowing to a phone
- Each step: number animates in, text slides, illustration draws itself
- Progress indicator (1/3, 2/3, 3/3) visible throughout

**Section 4: Platform Showcase (pinned)**
- Grid of supported gig platforms with hand-drawn platform icons
- On scroll: icons pop in one by one with a slight wobble animation
- Each icon links to its platform landing page (e.g. /loans-for-uber-drivers)
- Text: "We work with your platform"

**Section 5: Social Proof (pinned)**
- Stats counter animation: "$2M+ funded", "1,200+ gig workers", "4.8 star rating"
- Hand-drawn star/sparkle illustrations around the numbers
- Testimonial cards slide in from bottom

**Section 6: Why LimeCredit (scroll, not pinned)**
- 3-column grid of differentiators
- Each card has a small hand-drawn icon
- Cards: "No credit checks", "Same-day decisions", "Built for 1099 income"
- Standard scroll with subtle fade-in on intersection

**Section 7: Blog Preview (scroll, not pinned)**
- "From the Blog" — 3 latest published articles as cards
- Links to /blog

**Section 8: FAQ (scroll, not pinned)**
- Accordion FAQ section with FAQPage schema
- Hand-drawn question mark illustrations

**Section 9: Final CTA (pinned)**
- Full viewport. "Ready to get funded?"
- Large CTA button with hand-drawn arrow illustration pointing to it
- On scroll: elements converge to center

**Navbar:** Fixed top, transparent over hero, becomes solid on scroll. Logo, nav links (How It Works, Platforms, Blog, FAQ), Apply button.

**Footer:** Company info, legal links (Privacy, Terms, Disclosures), social links, platform page links, state page links (grouped by region).

### 6.4 Responsive Behavior

- Pinned scroll sections degrade gracefully on mobile — reduce pin duration, simplify animations
- Illustrations scale and reposition for mobile viewports
- Touch scrolling works naturally with ScrollTrigger's touch support

---

## 7. Content Page Templates

Clean, readable layouts — no heavy scroll animations. Consistent header/footer with homepage.

### 7.1 Article Template (`/blog/[slug]`)

- Breadcrumbs (Home > Blog > Category > Title)
- H1 title, publish date, estimated read time, category badge
- Featured image (full width)
- Table of contents (sticky sidebar on desktop, collapsible on mobile)
- Article body (rendered HTML from Tiptap)
- Tags at bottom
- Related Articles section (3 cards)
- CTA banner: "Need a loan? Apply in 5 minutes"

### 7.2 Platform Page Template (`/loans-for-[slug]`)

- Breadcrumbs
- Hero section: headline, subtext, hand-drawn platform illustration, "Apply Now" CTA
- "About [Platform] Loans" section with platform description
- Income stats card (avg earnings, top earner range)
- Loan details section
- FAQ accordion
- Related articles sidebar/section
- CTA footer

### 7.3 State Page Template (`/1099-loans-[slug]`)

- Breadcrumbs
- Hero: headline, subtext, state outline illustration
- Regulations summary
- Loan availability details
- Local stats (key-value display)
- FAQ accordion
- Nearby states links
- CTA footer

### 7.4 Tool Page Template (`/tools/[slug]`)

- Breadcrumbs
- Title, description
- Interactive tool component (rendered by component identifier)
- Optional body text below
- Related articles
- CTA footer

### 7.5 Comparison Page Template (`/compare/[slug]`)

- Breadcrumbs
- Title, intro text
- Side-by-side comparison table (feature rows, entity A vs B columns)
- Verdict section with recommendation
- FAQ accordion
- CTA footer

### 7.6 Blog Index (`/blog`)

- Page title, description
- Category filter tabs
- Article grid (cards with featured image, title, excerpt, date, category)
- Pagination (12 per page)

### 7.7 Category Archive (`/blog/category/[slug]`)

- Category name, description
- Same article grid as blog index, filtered to category

---

## 8. Interactive Tools

Built as React components, referenced by identifier in ToolPage:

**loan-calculator:** Loan amount slider, term selector, displays monthly payment, total interest, APR. Uses LimeCredit's actual rate range (30-60% APR).

**income-estimator:** Select gig platform(s), input hours/week, shows estimated annual income and loan eligibility range.

**loan-comparison:** Side-by-side comparison of LimeCredit terms vs typical MCA/traditional loan terms.

**dti-calculator:** Input monthly income and expenses, calculates debt-to-income ratio with guidance on loan eligibility.

**tax-estimator:** Input gig earnings, estimates quarterly tax obligations for 1099 workers.

---

## 9. Content Generation Plan

All content generated directly and seeded into the database.

### 9.1 Articles (~35)

**Guides (10):**
- Best Loans for Gig Workers in 2026
- How to Get a Loan With 1099 Income
- Bank Statement Loans Explained
- How to Build Credit as a Freelancer
- Emergency Loans for Self-Employed Workers
- Personal Loans vs MCA: What Gig Workers Need to Know
- How Much Can You Borrow as a 1099 Worker?
- Understanding APR: What Gig Workers Should Know
- How to Improve Your Loan Approval Chances
- The Complete Guide to Non-QM Loans

**Platform Tips (10):**
- How Much Do Uber Drivers Really Make?
- DoorDash Driver Income: What to Expect in 2026
- Instacart Shopper Earnings Breakdown
- Managing Finances as a Lyft Driver
- Amazon Flex Driver Income Guide
- Freelancing on Fiverr: Income and Loan Options
- Upwork Earnings: What Top Freelancers Make
- TaskRabbit Income: A Complete Breakdown
- How Grubhub Drivers Can Access Better Loans
- Multi-Platform Gig Work: Maximizing Your Income

**Loan Education (10):**
- What Is a 1099 Loan?
- 1099 Loans vs W-2 Loans: Key Differences
- How Loan Interest Rates Work for Self-Employed
- What Documents Do You Need for a 1099 Loan?
- How to Read Your Loan Agreement
- Understanding Loan Terms and Repayment Schedules
- What Happens If You Miss a Loan Payment?
- How to Pay Off Your Loan Faster
- Refinancing Your Gig Worker Loan
- When Should You Take Out a Loan?

**Tax & Finance (5):**
- 1099 Tax Deductions Every Gig Worker Should Know
- Quarterly Tax Payments: A Gig Worker's Guide
- How Self-Employment Tax Affects Your Loan Application
- Separating Business and Personal Finances
- Tax Season Prep for Multi-Platform Gig Workers

### 9.2 Platform Pages (14)

One page per platform: Uber, Lyft, DoorDash, Instacart, Amazon Flex, Grubhub, Postmates, Fiverr, Upwork, TaskRabbit, Shipt, Turo, Rover, Thumbtack.

### 9.3 State Pages (50)

One page per US state with state-specific lending regulations, local gig economy stats, and tailored copy.

### 9.4 Tool Pages (5)

Loan Calculator, Income Estimator, Loan Comparison, DTI Calculator, Tax Estimator.

### 9.5 Comparison Pages (5)

LimeCredit vs Fundo, LimeCredit vs Traditional Banks, LimeCredit vs MCA Providers, LimeCredit vs Credit Cards, LimeCredit vs Payday Loans.

**Total: ~109 pages**

---

## 10. Illustration Generation

### 10.1 Gemini API Integration

- Use Gemini API's imagen model to generate illustrations
- Build a generation script (`scripts/generate-illustrations.ts`) that:
  1. Defines prompts for each illustration needed (homepage sections + content page headers)
  2. Calls Gemini API with consistent style prompt prefix
  3. Saves output to `/public/illustrations/`
- Style prompt prefix: "Hand-drawn organic illustration, warm sketchy line art, imperfect strokes, sage green and cream color palette, charcoal outlines, approachable and human feel, white background, no text"

### 10.2 Illustrations Needed

**Homepage (9):**
1. Hero: gig worker on delivery bike
2. Problem: closed bank door
3. How it works step 1: person on phone filling form
4. How it works step 2: bank statements with checkmark
5. How it works step 3: money flowing to phone
6. Platform showcase: set of gig platform icons
7. Social proof: stars and sparkles
8. FAQ: question marks
9. Final CTA: arrow pointing to button

**Content pages (~20):**
- 14 platform illustrations (one per platform, showing the type of work)
- 5 tool page header illustrations
- 1 generic blog header illustration

Generated once, stored statically. Can be regenerated/refined as needed.

---

## 11. Dependencies & Packages

**New packages:**
- `gsap` — animation engine + ScrollTrigger plugin
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-link` — rich text editor
- `@google/generative-ai` — Gemini API client (already have API key per memory)

**Existing packages used:**
- Prisma (schema changes + migrations)
- Next.js App Router (new routes)
- Tailwind CSS (styling)
- shadcn/ui (admin UI components)
- next/image (content images)

---

## 12. Database Migration

New models added to existing Prisma schema. SQLite for dev, PostgreSQL for prod (existing setup). Migration via `prisma migrate dev`.

No changes to existing models (Application, Document, Payment, LoanRule, AdminUser).
