# LimeCredit SEO Content System & Homepage Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full CMS with 5 content types (~109 pages), SEO infrastructure, interactive tools, and a GSAP ScrollTrigger homepage redesign with hand-drawn Gemini-generated illustrations.

**Architecture:** Extend the existing Next.js 16 + Prisma monolith. New Prisma models for content types. Admin CMS under `/admin/content/` with Tiptap rich text editor. Public routes for blog, platform pages, state pages, tools, and comparisons. GSAP replaces Framer Motion on the homepage. Gemini API generates illustrations via a one-time script.

**Tech Stack:** Next.js 16, Prisma 7, Tiptap (rich text), GSAP + ScrollTrigger (animations), @google/generative-ai (Gemini illustrations), existing Tailwind 4 + @base-ui/react UI.

**Spec:** `docs/superpowers/specs/2026-04-04-seo-content-homepage-redesign-design.md`

---

## File Structure

### New Files

```
prisma/
  schema.prisma                          (MODIFY — add content models)
  migrations/                            (auto-generated)

src/
  actions/
    content.ts                           (server actions for all content CRUD)

  app/
    robots.txt/
      route.ts                           (dynamic robots.txt)
    sitemap.xml/
      route.ts                           (dynamic sitemap)

    (public)/
      blog/
        page.tsx                         (blog index — server)
        blog-client.tsx                  (blog index — client)
        [slug]/
          page.tsx                       (article detail — server, generateStaticParams)
        category/
          [slug]/
            page.tsx                     (category archive — server)
      loans-for-[slug]/
        page.tsx                         (platform page — server, generateStaticParams)
      1099-loans-[slug]/
        page.tsx                         (state page — server, generateStaticParams)
      tools/
        [slug]/
          page.tsx                       (tool page — server)
      compare/
        [slug]/
          page.tsx                       (comparison page — server)

    admin/
      content/
        page.tsx                         (content dashboard — server)
        content-dashboard-client.tsx     (content dashboard — client)
        articles/
          page.tsx                       (article list — server)
          articles-client.tsx            (article list — client)
          new/
            page.tsx                     (article editor — server)
            article-editor-client.tsx    (article editor — client)
          [id]/
            page.tsx                     (article edit — server)
            article-editor-client.tsx    (symlink/re-export from new/)
        platforms/
          page.tsx                       (platform list — server)
          platforms-client.tsx           (platform list — client)
          new/
            page.tsx
            platform-editor-client.tsx
          [id]/
            page.tsx
        states/
          page.tsx
          states-client.tsx
          new/
            page.tsx
            state-editor-client.tsx
          [id]/
            page.tsx
        tools/
          page.tsx
          tools-client.tsx
          new/
            page.tsx
            tool-editor-client.tsx
          [id]/
            page.tsx
        comparisons/
          page.tsx
          comparisons-client.tsx
          new/
            page.tsx
            comparison-editor-client.tsx
          [id]/
            page.tsx
        categories/
          page.tsx
          categories-client.tsx
        images/
          page.tsx
          images-client.tsx

    api/
      content/
        images/
          route.ts                       (image upload API)
        revalidate/
          route.ts                       (on-demand ISR revalidation)

  components/
    seo/
      json-ld.tsx                        (structured data component)
      meta-tags.tsx                      (OG/Twitter meta helper)
      breadcrumbs.tsx                    (breadcrumb nav + schema)
    content/
      tiptap-editor.tsx                  (Tiptap rich text editor)
      faq-accordion.tsx                  (FAQ section with schema)
      related-content.tsx                (related articles/pages)
      content-cta.tsx                    (CTA banner for content pages)
      table-of-contents.tsx              (auto-generated TOC for articles)
      article-card.tsx                   (blog card component)
    tools/
      loan-calculator.tsx
      income-estimator.tsx
      loan-comparison.tsx
      dti-calculator.tsx
      tax-estimator.tsx
    homepage/
      homepage.tsx                       (main homepage client component)
      sections/
        hero.tsx
        problem.tsx
        how-it-works.tsx
        platform-showcase.tsx
        social-proof.tsx
        why-limecredit.tsx
        blog-preview.tsx
        faq.tsx
        final-cta.tsx
      navbar.tsx                         (public navbar)
      footer.tsx                         (public footer with SEO links)

  lib/
    seo.ts                               (SEO utility functions)
    content-helpers.ts                   (slug generation, excerpt, etc.)

  types/
    content.ts                           (TypeScript types for content models)

scripts/
  generate-illustrations.ts             (Gemini API illustration generator)
  seed-content.ts                        (seed all ~109 pages)

public/
  illustrations/                         (generated illustrations)
```

### Modified Files

```
src/middleware.ts                        (add /admin/content/* to matcher)
src/components/admin-sidebar.tsx         (add Content nav section)
src/app/layout.tsx                       (update metadata, add OG defaults)
src/app/page.tsx                         (complete rewrite — GSAP homepage)
src/app/(public)/layout.tsx              (create — shared public layout with navbar/footer)
package.json                             (new deps: gsap, tiptap, @google/generative-ai)
```

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install GSAP, Tiptap, and Gemini packages**

```bash
cd /Users/baralezrah/loan-portal
npm install gsap @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link @tiptap/extension-placeholder @tiptap/extension-heading @google/generative-ai
```

- [ ] **Step 2: Verify installation**

```bash
cd /Users/baralezrah/loan-portal && node -e "require('gsap'); require('@tiptap/react'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/baralezrah/loan-portal
git add package.json package-lock.json
git commit -m "chore: add gsap, tiptap, and gemini dependencies"
```

---

## Task 2: Prisma Schema — Content Models

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/types/content.ts`

- [ ] **Step 1: Add content models to Prisma schema**

Append the following after the existing `RiskModel` model in `prisma/schema.prisma`:

```prisma
// ─── Content Management ─────────────────────────────────────

model Category {
  id          String    @id @default(uuid())
  name        String    @unique
  slug        String    @unique
  description String?
  createdAt   DateTime  @default(now())
  articles    Article[]

  @@index([slug])
}

model Tag {
  id        String       @id @default(uuid())
  name      String       @unique
  slug      String       @unique
  createdAt DateTime     @default(now())
  articles  ArticleTag[]

  @@index([slug])
}

model ArticleTag {
  id        String  @id @default(uuid())
  articleId String
  tagId     String
  article   Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  tag       Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([articleId, tagId])
  @@index([articleId])
  @@index([tagId])
}

model Article {
  id              String       @id @default(uuid())
  title           String
  slug            String       @unique
  body            String
  excerpt         String?
  featuredImage   String?
  categoryId      String?
  metaTitle       String?
  metaDescription String?
  ogImage         String?
  canonicalUrl    String?
  noIndex         Boolean      @default(false)
  published       Boolean      @default(false)
  publishedAt     DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  category        Category?    @relation(fields: [categoryId], references: [id])
  tags            ArticleTag[]

  @@index([slug])
  @@index([published])
  @@index([categoryId])
}

model PlatformPage {
  id                  String   @id @default(uuid())
  platformName        String   @unique
  slug                String   @unique
  heroHeadline        String
  heroSubtext         String
  platformDescription String
  avgEarnings         String?
  topEarnerRange      String?
  loanDetailsHtml     String?
  faqEntries          String   @default("[]")
  ctaText             String?
  ctaSubtext          String?
  metaTitle           String?
  metaDescription     String?
  ogImage             String?
  canonicalUrl        String?
  noIndex             Boolean  @default(false)
  published           Boolean  @default(false)
  publishedAt         DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([slug])
  @@index([published])
}

model StatePage {
  id                  String   @id @default(uuid())
  stateName           String   @unique
  stateCode           String   @unique
  slug                String   @unique
  heroHeadline        String
  heroSubtext         String
  regulationsSummary  String?
  loanAvailability    String?
  localStats          String   @default("[]")
  faqEntries          String   @default("[]")
  ctaText             String?
  metaTitle           String?
  metaDescription     String?
  ogImage             String?
  canonicalUrl        String?
  noIndex             Boolean  @default(false)
  published           Boolean  @default(false)
  publishedAt         DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([slug])
  @@index([published])
}

model ToolPage {
  id                  String   @id @default(uuid())
  title               String
  slug                String   @unique
  description         String
  toolComponent       String
  body                String?
  relatedArticleSlugs String   @default("[]")
  metaTitle           String?
  metaDescription     String?
  ogImage             String?
  canonicalUrl        String?
  noIndex             Boolean  @default(false)
  published           Boolean  @default(false)
  publishedAt         DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([slug])
  @@index([published])
}

model ComparisonPage {
  id              String   @id @default(uuid())
  title           String
  slug            String   @unique
  entityA         String
  entityB         String
  introHtml       String?
  comparisonGrid  String   @default("[]")
  verdict         String?
  faqEntries      String   @default("[]")
  metaTitle       String?
  metaDescription String?
  ogImage         String?
  canonicalUrl    String?
  noIndex         Boolean  @default(false)
  published       Boolean  @default(false)
  publishedAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([slug])
  @@index([published])
}

model ContentImage {
  id          String   @id @default(uuid())
  fileName    String
  mimeType    String
  fileSize    Int
  storagePath String
  altText     String?
  createdAt   DateTime @default(now())
}
```

- [ ] **Step 2: Create TypeScript types**

Create `src/types/content.ts`:

```typescript
export interface FaqEntry {
  question: string;
  answer: string;
}

export interface LocalStat {
  label: string;
  value: string;
}

export interface ComparisonRow {
  feature: string;
  entityAValue: string;
  entityBValue: string;
}

export interface SeoFields {
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  canonicalUrl: string | null;
  noIndex: boolean;
}
```

- [ ] **Step 3: Run migration**

```bash
cd /Users/baralezrah/loan-portal
npx prisma migrate dev --name add_content_models
```

Expected: Migration created and applied successfully.

- [ ] **Step 4: Verify generated client has new models**

```bash
cd /Users/baralezrah/loan-portal
node -e "const { PrismaClient } = require('./src/generated/prisma/client'); const p = new PrismaClient(); console.log(typeof p.article, typeof p.platformPage, typeof p.statePage, typeof p.toolPage, typeof p.comparisonPage, typeof p.category, typeof p.tag, typeof p.contentImage)"
```

Expected: all `object`

- [ ] **Step 5: Commit**

```bash
cd /Users/baralezrah/loan-portal
git add prisma/ src/types/content.ts src/generated/
git commit -m "feat: add content management prisma models and types"
```

---

## Task 3: Content Server Actions

**Files:**
- Create: `src/actions/content.ts`
- Create: `src/lib/content-helpers.ts`

- [ ] **Step 1: Create content helper utilities**

Create `src/lib/content-helpers.ts`:

```typescript
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function generateExcerpt(html: string, maxLength = 160): string {
  const text = html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s\S*$/, "") + "...";
}
```

- [ ] **Step 2: Create content server actions**

Create `src/actions/content.ts`:

```typescript
"use server";

import { prisma } from "@/lib/db";

// ─── Categories ─────────────────────────────────────────────

export async function getCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

export async function createCategory(data: { name: string; slug: string; description?: string }) {
  return prisma.category.create({ data });
}

export async function updateCategory(id: string, data: { name?: string; slug?: string; description?: string }) {
  return prisma.category.update({ where: { id }, data });
}

export async function deleteCategory(id: string) {
  return prisma.category.delete({ where: { id } });
}

// ─── Tags ───────────────────────────────────────────────────

export async function getTags() {
  return prisma.tag.findMany({ orderBy: { name: "asc" } });
}

export async function createTag(data: { name: string; slug: string }) {
  return prisma.tag.create({ data });
}

export async function deleteTag(id: string) {
  await prisma.articleTag.deleteMany({ where: { tagId: id } });
  return prisma.tag.delete({ where: { id } });
}

// ─── Articles ───────────────────────────────────────────────

export async function getArticles() {
  return prisma.article.findMany({
    include: { category: true, tags: { include: { tag: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getArticle(id: string) {
  return prisma.article.findUnique({
    where: { id },
    include: { category: true, tags: { include: { tag: true } } },
  });
}

export async function getArticleBySlug(slug: string) {
  return prisma.article.findUnique({
    where: { slug },
    include: { category: true, tags: { include: { tag: true } } },
  });
}

export async function getPublishedArticles(categorySlug?: string, page = 1, perPage = 12) {
  const where: Record<string, unknown> = { published: true };
  if (categorySlug) {
    where.category = { slug: categorySlug };
  }
  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      include: { category: true, tags: { include: { tag: true } } },
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.article.count({ where }),
  ]);
  return { articles, total, totalPages: Math.ceil(total / perPage) };
}

export async function createArticle(data: {
  title: string;
  slug: string;
  body: string;
  excerpt?: string;
  featuredImage?: string;
  categoryId?: string;
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  published?: boolean;
  publishedAt?: string;
  tagIds?: string[];
}) {
  const { tagIds, publishedAt, ...rest } = data;
  const article = await prisma.article.create({
    data: {
      ...rest,
      publishedAt: publishedAt ? new Date(publishedAt) : data.published ? new Date() : null,
    },
  });
  if (tagIds?.length) {
    await prisma.articleTag.createMany({
      data: tagIds.map((tagId) => ({ articleId: article.id, tagId })),
    });
  }
  return article;
}

export async function updateArticle(
  id: string,
  data: {
    title?: string;
    slug?: string;
    body?: string;
    excerpt?: string;
    featuredImage?: string;
    categoryId?: string | null;
    metaTitle?: string;
    metaDescription?: string;
    ogImage?: string;
    published?: boolean;
    publishedAt?: string;
    tagIds?: string[];
  }
) {
  const { tagIds, publishedAt, ...rest } = data;
  const updateData: Record<string, unknown> = { ...rest };
  if (publishedAt !== undefined) {
    updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
  }
  const article = await prisma.article.update({ where: { id }, data: updateData });
  if (tagIds !== undefined) {
    await prisma.articleTag.deleteMany({ where: { articleId: id } });
    if (tagIds.length) {
      await prisma.articleTag.createMany({
        data: tagIds.map((tagId) => ({ articleId: id, tagId })),
      });
    }
  }
  return article;
}

export async function deleteArticle(id: string) {
  return prisma.article.delete({ where: { id } });
}

// ─── Platform Pages ─────────────────────────────────────────

export async function getPlatformPages() {
  return prisma.platformPage.findMany({ orderBy: { platformName: "asc" } });
}

export async function getPlatformPage(id: string) {
  return prisma.platformPage.findUnique({ where: { id } });
}

export async function getPlatformPageBySlug(slug: string) {
  return prisma.platformPage.findUnique({ where: { slug } });
}

export async function getPublishedPlatformPages() {
  return prisma.platformPage.findMany({ where: { published: true }, orderBy: { platformName: "asc" } });
}

export async function createPlatformPage(data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  return prisma.platformPage.create({
    data: {
      ...rest,
      publishedAt: publishedAt ? new Date(publishedAt) : (rest.published ? new Date() : null),
    } as never,
  });
}

export async function updatePlatformPage(id: string, data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  const updateData = { ...rest } as Record<string, unknown>;
  if (publishedAt !== undefined) {
    updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
  }
  return prisma.platformPage.update({ where: { id }, data: updateData as never });
}

export async function deletePlatformPage(id: string) {
  return prisma.platformPage.delete({ where: { id } });
}

// ─── State Pages ────────────────────────────────────────────

export async function getStatePages() {
  return prisma.statePage.findMany({ orderBy: { stateName: "asc" } });
}

export async function getStatePage(id: string) {
  return prisma.statePage.findUnique({ where: { id } });
}

export async function getStatePageBySlug(slug: string) {
  return prisma.statePage.findUnique({ where: { slug } });
}

export async function getPublishedStatePages() {
  return prisma.statePage.findMany({ where: { published: true }, orderBy: { stateName: "asc" } });
}

export async function createStatePage(data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  return prisma.statePage.create({
    data: {
      ...rest,
      publishedAt: publishedAt ? new Date(publishedAt) : (rest.published ? new Date() : null),
    } as never,
  });
}

export async function updateStatePage(id: string, data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  const updateData = { ...rest } as Record<string, unknown>;
  if (publishedAt !== undefined) {
    updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
  }
  return prisma.statePage.update({ where: { id }, data: updateData as never });
}

export async function deleteStatePage(id: string) {
  return prisma.statePage.delete({ where: { id } });
}

// ─── Tool Pages ─────────────────────────────────────────────

export async function getToolPages() {
  return prisma.toolPage.findMany({ orderBy: { title: "asc" } });
}

export async function getToolPage(id: string) {
  return prisma.toolPage.findUnique({ where: { id } });
}

export async function getToolPageBySlug(slug: string) {
  return prisma.toolPage.findUnique({ where: { slug } });
}

export async function getPublishedToolPages() {
  return prisma.toolPage.findMany({ where: { published: true }, orderBy: { title: "asc" } });
}

export async function createToolPage(data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  return prisma.toolPage.create({
    data: {
      ...rest,
      publishedAt: publishedAt ? new Date(publishedAt) : (rest.published ? new Date() : null),
    } as never,
  });
}

export async function updateToolPage(id: string, data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  const updateData = { ...rest } as Record<string, unknown>;
  if (publishedAt !== undefined) {
    updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
  }
  return prisma.toolPage.update({ where: { id }, data: updateData as never });
}

export async function deleteToolPage(id: string) {
  return prisma.toolPage.delete({ where: { id } });
}

// ─── Comparison Pages ───────────────────────────────────────

export async function getComparisonPages() {
  return prisma.comparisonPage.findMany({ orderBy: { title: "asc" } });
}

export async function getComparisonPage(id: string) {
  return prisma.comparisonPage.findUnique({ where: { id } });
}

export async function getComparisonPageBySlug(slug: string) {
  return prisma.comparisonPage.findUnique({ where: { slug } });
}

export async function getPublishedComparisonPages() {
  return prisma.comparisonPage.findMany({ where: { published: true }, orderBy: { title: "asc" } });
}

export async function createComparisonPage(data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  return prisma.comparisonPage.create({
    data: {
      ...rest,
      publishedAt: publishedAt ? new Date(publishedAt) : (rest.published ? new Date() : null),
    } as never,
  });
}

export async function updateComparisonPage(id: string, data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  const updateData = { ...rest } as Record<string, unknown>;
  if (publishedAt !== undefined) {
    updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
  }
  return prisma.comparisonPage.update({ where: { id }, data: updateData as never });
}

export async function deleteComparisonPage(id: string) {
  return prisma.comparisonPage.delete({ where: { id } });
}

// ─── Content Images ─────────────────────────────────────────

export async function getContentImages() {
  return prisma.contentImage.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createContentImage(data: {
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  altText?: string;
}) {
  return prisma.contentImage.create({ data });
}

export async function updateContentImageAlt(id: string, altText: string) {
  return prisma.contentImage.update({ where: { id }, data: { altText } });
}

export async function deleteContentImage(id: string) {
  return prisma.contentImage.delete({ where: { id } });
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/baralezrah/loan-portal
git add src/actions/content.ts src/lib/content-helpers.ts
git commit -m "feat: add content server actions and helper utilities"
```

---

## Task 4: SEO Infrastructure

**Files:**
- Create: `src/lib/seo.ts`
- Create: `src/components/seo/json-ld.tsx`
- Create: `src/components/seo/breadcrumbs.tsx`
- Create: `src/app/robots.txt/route.ts`
- Create: `src/app/sitemap.xml/route.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create SEO utility library**

Create `src/lib/seo.ts`:

```typescript
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://limecredit.com";
const SITE_NAME = "LimeCredit";

export function absoluteUrl(path: string) {
  return `${SITE_URL}${path}`;
}

export function generateMeta({
  title,
  description,
  ogImage,
  canonicalUrl,
  noIndex,
  type = "website",
}: {
  title: string;
  description: string;
  ogImage?: string | null;
  canonicalUrl?: string | null;
  noIndex?: boolean;
  type?: string;
}) {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const meta: Record<string, unknown> = {
    title: fullTitle,
    description,
    openGraph: {
      title: fullTitle,
      description,
      siteName: SITE_NAME,
      type,
      ...(ogImage && { images: [{ url: absoluteUrl(ogImage), width: 1200, height: 630 }] }),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      ...(ogImage && { images: [absoluteUrl(ogImage)] }),
    },
    ...(noIndex && { robots: { index: false, follow: false } }),
    ...(canonicalUrl && { alternates: { canonical: canonicalUrl } }),
  };
  return meta;
}
```

- [ ] **Step 2: Create JSON-LD component**

Create `src/components/seo/json-ld.tsx`:

```tsx
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "LimeCredit",
    url: "https://limecredit.com",
    description: "Fast loans for gig workers. $100 to $10,000.",
    contactPoint: { "@type": "ContactPoint", email: "support@limecredit.com" },
  };
}

export function articleSchema(article: {
  title: string;
  slug: string;
  excerpt?: string | null;
  publishedAt?: Date | null;
  updatedAt: Date;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    url: `https://limecredit.com/blog/${article.slug}`,
    ...(article.excerpt && { description: article.excerpt }),
    ...(article.publishedAt && { datePublished: article.publishedAt.toISOString() }),
    dateModified: article.updatedAt.toISOString(),
    publisher: { "@type": "Organization", name: "LimeCredit" },
  };
}

export function faqSchema(entries: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((e) => ({
      "@type": "Question",
      name: e.question,
      acceptedAnswer: { "@type": "Answer", text: e.answer },
    })),
  };
}

export function loanProductSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "LoanOrCredit",
    name: "LimeCredit Gig Worker Loan",
    amount: { "@type": "MonetaryAmount", currency: "USD", minValue: 100, maxValue: 10000 },
    annualPercentageRate: { "@type": "QuantitativeValue", minValue: 30, maxValue: 60 },
    loanTerm: { "@type": "QuantitativeValue", minValue: 3, maxValue: 18, unitCode: "MON" },
    provider: { "@type": "Organization", name: "LimeCredit" },
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
```

- [ ] **Step 3: Create Breadcrumbs component**

Create `src/components/seo/breadcrumbs.tsx`:

```tsx
import Link from "next/link";
import { JsonLd, breadcrumbSchema } from "./json-ld";

interface BreadcrumbItem {
  label: string;
  href: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const schemaItems = items.map((item) => ({
    name: item.label,
    url: `https://limecredit.com${item.href}`,
  }));

  return (
    <>
      <JsonLd data={breadcrumbSchema(schemaItems)} />
      <nav aria-label="Breadcrumb" className="text-[13px] text-[#71717a] mb-6">
        {items.map((item, i) => (
          <span key={item.href}>
            {i > 0 && <span className="mx-1.5">/</span>}
            {i === items.length - 1 ? (
              <span className="text-[#1a1a1a]">{item.label}</span>
            ) : (
              <Link href={item.href} className="hover:text-[#15803d] transition-colors">
                {item.label}
              </Link>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
```

- [ ] **Step 4: Create robots.txt route**

Create `src/app/robots.txt/route.ts`:

```typescript
export function GET() {
  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /status

Sitemap: https://limecredit.com/sitemap.xml`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
  });
}
```

- [ ] **Step 5: Create dynamic sitemap route**

Create `src/app/sitemap.xml/route.ts`:

```typescript
import { prisma } from "@/lib/db";

export async function GET() {
  const [articles, platforms, states, tools, comparisons] = await Promise.all([
    prisma.article.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    prisma.platformPage.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    prisma.statePage.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    prisma.toolPage.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
    prisma.comparisonPage.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
  ]);

  const base = "https://limecredit.com";

  const staticPages = [
    { url: "/", priority: "1.0" },
    { url: "/apply", priority: "0.9" },
    { url: "/blog", priority: "0.8" },
    { url: "/privacy", priority: "0.3" },
    { url: "/terms", priority: "0.3" },
    { url: "/disclosures", priority: "0.3" },
  ];

  const urls = [
    ...staticPages.map((p) => `
    <url>
      <loc>${base}${p.url}</loc>
      <priority>${p.priority}</priority>
    </url>`),
    ...articles.map((a) => `
    <url>
      <loc>${base}/blog/${a.slug}</loc>
      <lastmod>${a.updatedAt.toISOString()}</lastmod>
      <priority>0.7</priority>
    </url>`),
    ...platforms.map((p) => `
    <url>
      <loc>${base}/loans-for-${p.slug}</loc>
      <lastmod>${p.updatedAt.toISOString()}</lastmod>
      <priority>0.8</priority>
    </url>`),
    ...states.map((s) => `
    <url>
      <loc>${base}/1099-loans-${s.slug}</loc>
      <lastmod>${s.updatedAt.toISOString()}</lastmod>
      <priority>0.7</priority>
    </url>`),
    ...tools.map((t) => `
    <url>
      <loc>${base}/tools/${t.slug}</loc>
      <lastmod>${t.updatedAt.toISOString()}</lastmod>
      <priority>0.6</priority>
    </url>`),
    ...comparisons.map((c) => `
    <url>
      <loc>${base}/compare/${c.slug}</loc>
      <lastmod>${c.updatedAt.toISOString()}</lastmod>
      <priority>0.6</priority>
    </url>`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
```

- [ ] **Step 6: Update root layout metadata**

In `src/app/layout.tsx`, update the metadata export to include OG defaults:

```typescript
export const metadata: Metadata = {
  title: {
    default: "LimeCredit — Fast Loans for Gig Workers",
    template: "%s | LimeCredit",
  },
  description: "Fast loans for gig workers. $100 to $10,000. Apply in 5 minutes, get funded in hours. No credit checks.",
  metadataBase: new URL("https://limecredit.com"),
  openGraph: {
    siteName: "LimeCredit",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};
```

- [ ] **Step 7: Commit**

```bash
cd /Users/baralezrah/loan-portal
git add src/lib/seo.ts src/components/seo/ src/app/robots.txt/ src/app/sitemap.xml/ src/app/layout.tsx
git commit -m "feat: add SEO infrastructure — robots.txt, sitemap, JSON-LD, meta helpers"
```

---

## Task 5: Admin Navigation & Content Dashboard

**Files:**
- Modify: `src/components/admin-sidebar.tsx`
- Modify: `src/middleware.ts`
- Create: `src/app/admin/content/page.tsx`
- Create: `src/app/admin/content/content-dashboard-client.tsx`

- [ ] **Step 1: Add Content section to admin sidebar**

In `src/components/admin-sidebar.tsx`, add a "Content" section to the `navItems` array after the "Audit Log" entry. Add these items:

```typescript
{
  href: "/admin/content",
  label: "Content",
  icon: (
    <svg className="size-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6V7.5Z" />
    </svg>
  ),
},
```

- [ ] **Step 2: Add /admin/content/* to middleware matcher**

In `src/middleware.ts`, update the matcher:

```typescript
export const config = {
  matcher: ["/admin/dashboard/:path*", "/admin/applications/:path*", "/admin/settings/:path*", "/admin/audit/:path*", "/admin/payments/:path*", "/admin/content/:path*"],
};
```

- [ ] **Step 3: Create content dashboard server page**

Create `src/app/admin/content/page.tsx`:

```tsx
import { getArticles, getPlatformPages, getStatePages, getToolPages, getComparisonPages } from "@/actions/content";
import { ContentDashboardClient } from "./content-dashboard-client";

export default async function ContentDashboardPage() {
  const [articles, platforms, states, tools, comparisons] = await Promise.all([
    getArticles(),
    getPlatformPages(),
    getStatePages(),
    getToolPages(),
    getComparisonPages(),
  ]);

  return (
    <ContentDashboardClient
      counts={{
        articles: articles.length,
        platforms: platforms.length,
        states: states.length,
        tools: tools.length,
        comparisons: comparisons.length,
        published: [
          ...articles.filter((a) => a.published),
          ...platforms.filter((p) => p.published),
          ...states.filter((s) => s.published),
          ...tools.filter((t) => t.published),
          ...comparisons.filter((c) => c.published),
        ].length,
      }}
    />
  );
}
```

- [ ] **Step 4: Create content dashboard client component**

Create `src/app/admin/content/content-dashboard-client.tsx`:

```tsx
"use client";

import Link from "next/link";

const contentTypes = [
  { label: "Articles", href: "/admin/content/articles", key: "articles" as const },
  { label: "Platform Pages", href: "/admin/content/platforms", key: "platforms" as const },
  { label: "State Pages", href: "/admin/content/states", key: "states" as const },
  { label: "Tool Pages", href: "/admin/content/tools", key: "tools" as const },
  { label: "Comparisons", href: "/admin/content/comparisons", key: "comparisons" as const },
];

const quickLinks = [
  { label: "Categories & Tags", href: "/admin/content/categories" },
  { label: "Image Library", href: "/admin/content/images" },
];

export function ContentDashboardClient({
  counts,
}: {
  counts: {
    articles: number;
    platforms: number;
    states: number;
    tools: number;
    comparisons: number;
    published: number;
  };
}) {
  const total = counts.articles + counts.platforms + counts.states + counts.tools + counts.comparisons;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">Content</h1>
          <p className="text-[13px] text-[#71717a] mt-1">{total} total pages · {counts.published} published</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {contentTypes.map((type) => (
          <Link
            key={type.key}
            href={type.href}
            className="bg-white rounded-[10px] p-4 hover:shadow-sm transition-shadow"
          >
            <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-1">{type.label}</p>
            <p className="text-[22px] font-extrabold tracking-[-0.02em] text-[#1a1a1a]">{counts[type.key]}</p>
          </Link>
        ))}
      </div>

      <div className="flex gap-3">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-[13px] font-medium text-[#15803d] hover:underline"
          >
            {link.label} →
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/baralezrah/loan-portal
git add src/components/admin-sidebar.tsx src/middleware.ts src/app/admin/content/
git commit -m "feat: add admin content dashboard and navigation"
```

---

## Task 6: Image Upload API & Image Library

**Files:**
- Create: `src/app/api/content/images/route.ts`
- Create: `src/app/admin/content/images/page.tsx`
- Create: `src/app/admin/content/images/images-client.tsx`

- [ ] **Step 1: Create image upload API route**

Create `src/app/api/content/images/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { createContentImage, deleteContentImage, getContentImages } from "@/actions/content";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "content");
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function GET() {
  const images = await getContentImages();
  return NextResponse.json(images);
}

export async function POST(request: NextRequest) {
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const altText = formData.get("altText") as string | null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileName = `${timestamp}-${safeName}`;
    const storagePath = `/uploads/content/${fileName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(UPLOAD_DIR, fileName), buffer);

    const image = await createContentImage({
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      storagePath,
      altText: altText || undefined,
    });

    return NextResponse.json(image);
  } catch (error) {
    console.error("Image upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id, storagePath } = await request.json();
    const filePath = join(process.cwd(), "public", storagePath);
    try { await unlink(filePath); } catch {}
    await deleteContentImage(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Image delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create image library server page**

Create `src/app/admin/content/images/page.tsx`:

```tsx
import { getContentImages } from "@/actions/content";
import { ImagesClient } from "./images-client";

export default async function ImagesPage() {
  const images = await getContentImages();
  return <ImagesClient initialImages={images} />;
}
```

- [ ] **Step 3: Create image library client component**

Create `src/app/admin/content/images/images-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface ContentImage {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  altText: string | null;
  createdAt: string;
}

export function ImagesClient({ initialImages }: { initialImages: ContentImage[] }) {
  const [images, setImages] = useState(initialImages);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/content/images", { method: "POST", body: formData });
    if (res.ok) {
      const image = await res.json();
      setImages([image, ...images]);
    }
    setUploading(false);
    e.target.value = "";
  }

  async function handleDelete(image: ContentImage) {
    if (!confirm(`Delete ${image.fileName}?`)) return;
    const res = await fetch("/api/content/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: image.id, storagePath: image.storagePath }),
    });
    if (res.ok) {
      setImages(images.filter((i) => i.id !== image.id));
    }
  }

  function copyPath(path: string) {
    navigator.clipboard.writeText(path);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">Image Library</h1>
        <label className="cursor-pointer bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534] transition-colors">
          {uploading ? "Uploading..." : "Upload Image"}
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {images.map((image) => (
          <div key={image.id} className="bg-white rounded-[10px] overflow-hidden group">
            <div className="aspect-video relative bg-[#f4f4f5]">
              <Image src={image.storagePath} alt={image.altText || image.fileName} fill className="object-cover" />
            </div>
            <div className="p-3">
              <p className="text-[13px] font-medium text-[#1a1a1a] truncate">{image.fileName}</p>
              <p className="text-[11px] text-[#a1a1aa]">{(image.fileSize / 1024).toFixed(0)} KB</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => copyPath(image.storagePath)}
                  className="text-[11px] text-[#15803d] hover:underline"
                >
                  Copy Path
                </button>
                <button
                  onClick={() => handleDelete(image)}
                  className="text-[11px] text-red-500 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {images.length === 0 && (
        <p className="text-center text-[#71717a] text-[14px] py-12">No images uploaded yet.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create uploads directory**

```bash
mkdir -p /Users/baralezrah/loan-portal/public/uploads/content
```

- [ ] **Step 5: Commit**

```bash
cd /Users/baralezrah/loan-portal
git add src/app/api/content/images/ src/app/admin/content/images/
git commit -m "feat: add content image upload API and image library"
```

---

## Task 7: Tiptap Editor Component

**Files:**
- Create: `src/components/content/tiptap-editor.tsx`

- [ ] **Step 1: Create Tiptap editor component**

Create `src/components/content/tiptap-editor.tsx`:

```tsx
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

interface TiptapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function MenuBar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const btnClass = (active: boolean) =>
    `px-2 py-1 text-[12px] font-medium rounded transition-colors ${
      active ? "bg-[#f0f5f0] text-[#15803d]" : "text-[#71717a] hover:bg-[#f4f4f5]"
    }`;

  return (
    <div className="flex flex-wrap gap-1 border-b border-[#e4e4e7] p-2">
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btnClass(editor.isActive("heading", { level: 2 }))}>
        H2
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btnClass(editor.isActive("heading", { level: 3 }))}>
        H3
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive("bold"))}>
        B
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive("italic"))}>
        I
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive("bulletList"))}>
        • List
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive("orderedList"))}>
        1. List
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive("blockquote"))}>
        Quote
      </button>
      <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btnClass(false)}>
        ―
      </button>
      <button
        type="button"
        onClick={() => {
          const url = window.prompt("Link URL:");
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        className={btnClass(editor.isActive("link"))}
      >
        Link
      </button>
      <button
        type="button"
        onClick={() => {
          const url = window.prompt("Image URL (or paste from Image Library):");
          if (url) editor.chain().focus().setImage({ src: url }).run();
        }}
        className={btnClass(false)}
      >
        Image
      </button>
    </div>
  );
}

export function TiptapEditor({ content, onChange, placeholder = "Start writing..." }: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      ImageExtension,
      LinkExtension.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  return (
    <div className="border border-[#e4e4e7] rounded-[10px] bg-white overflow-hidden">
      <MenuBar editor={editor} />
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-4 min-h-[400px] focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[400px] [&_.tiptap.ProseMirror_p.is-editor-empty:first-child::before]:text-[#a1a1aa] [&_.tiptap.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.tiptap.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap.ProseMirror_p.is-editor-empty:first-child::before]:h-0"
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/baralezrah/loan-portal
git add src/components/content/tiptap-editor.tsx
git commit -m "feat: add Tiptap rich text editor component"
```

---

## Task 8: Categories & Tags Admin Page

**Files:**
- Create: `src/app/admin/content/categories/page.tsx`
- Create: `src/app/admin/content/categories/categories-client.tsx`

- [ ] **Step 1: Create categories server page**

Create `src/app/admin/content/categories/page.tsx`:

```tsx
import { getCategories, getTags } from "@/actions/content";
import { CategoriesClient } from "./categories-client";

export default async function CategoriesPage() {
  const [categories, tags] = await Promise.all([getCategories(), getTags()]);
  return <CategoriesClient initialCategories={categories} initialTags={tags} />;
}
```

- [ ] **Step 2: Create categories client component**

Create `src/app/admin/content/categories/categories-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCategory, deleteCategory, createTag, deleteTag } from "@/actions/content";
import { slugify } from "@/lib/content-helpers";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

interface Tag {
  id: string;
  name: string;
  slug: string;
}

export function CategoriesClient({
  initialCategories,
  initialTags,
}: {
  initialCategories: Category[];
  initialTags: Tag[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [tags, setTags] = useState(initialTags);
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [tagName, setTagName] = useState("");
  const router = useRouter();

  async function handleAddCategory() {
    if (!catName.trim()) return;
    const cat = await createCategory({ name: catName.trim(), slug: slugify(catName), description: catDesc || undefined });
    setCategories([...categories, cat]);
    setCatName("");
    setCatDesc("");
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm("Delete this category?")) return;
    await deleteCategory(id);
    setCategories(categories.filter((c) => c.id !== id));
  }

  async function handleAddTag() {
    if (!tagName.trim()) return;
    const tag = await createTag({ name: tagName.trim(), slug: slugify(tagName) });
    setTags([...tags, tag]);
    setTagName("");
  }

  async function handleDeleteTag(id: string) {
    if (!confirm("Delete this tag?")) return;
    await deleteTag(id);
    setTags(tags.filter((t) => t.id !== id));
  }

  return (
    <div>
      <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-6">Categories & Tags</h1>

      <div className="grid grid-cols-2 gap-8">
        {/* Categories */}
        <div>
          <h2 className="text-[15px] font-bold text-[#1a1a1a] mb-4">Categories</h2>
          <div className="flex gap-2 mb-4">
            <input
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="Category name"
              className="flex-1 text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg"
            />
            <input
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              placeholder="Description (optional)"
              className="flex-1 text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg"
            />
            <button onClick={handleAddCategory} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534]">
              Add
            </button>
          </div>
          <div className="space-y-2">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between bg-white rounded-[10px] px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium text-[#1a1a1a]">{cat.name}</p>
                  <p className="text-[11px] text-[#a1a1aa]">/{cat.slug}</p>
                </div>
                <button onClick={() => handleDeleteCategory(cat.id)} className="text-[11px] text-red-500 hover:underline">
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <h2 className="text-[15px] font-bold text-[#1a1a1a] mb-4">Tags</h2>
          <div className="flex gap-2 mb-4">
            <input
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="Tag name"
              className="flex-1 text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg"
            />
            <button onClick={handleAddTag} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534]">
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag.id} className="inline-flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 text-[12px] text-[#1a1a1a]">
                {tag.name}
                <button onClick={() => handleDeleteTag(tag.id)} className="text-red-400 hover:text-red-600">×</button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/baralezrah/loan-portal
git add src/app/admin/content/categories/
git commit -m "feat: add categories and tags admin management"
```

---

## Task 9: Article Editor (Admin)

**Files:**
- Create: `src/app/admin/content/articles/page.tsx`
- Create: `src/app/admin/content/articles/articles-client.tsx`
- Create: `src/app/admin/content/articles/new/page.tsx`
- Create: `src/app/admin/content/articles/new/article-editor-client.tsx`
- Create: `src/app/admin/content/articles/[id]/page.tsx`

- [ ] **Step 1: Create article list server page**

Create `src/app/admin/content/articles/page.tsx`:

```tsx
import { getArticles } from "@/actions/content";
import { ArticlesClient } from "./articles-client";

export default async function ArticlesPage() {
  const articles = await getArticles();
  return <ArticlesClient articles={articles} />;
}
```

- [ ] **Step 2: Create article list client component**

Create `src/app/admin/content/articles/articles-client.tsx`:

```tsx
"use client";

import Link from "next/link";

interface ArticleWithRelations {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
  category: { name: string } | null;
}

export function ArticlesClient({ articles }: { articles: ArticleWithRelations[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">Articles</h1>
        <Link
          href="/admin/content/articles/new"
          className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534] transition-colors"
        >
          New Article
        </Link>
      </div>

      <div className="bg-white rounded-[10px] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#f4f4f5]">
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Title</th>
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Category</th>
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Status</th>
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => (
              <tr key={article.id} className="border-b border-[#f4f4f5] last:border-0 hover:bg-[#f8faf8]">
                <td className="px-4 py-3">
                  <Link href={`/admin/content/articles/${article.id}`} className="text-[13px] font-medium text-[#1a1a1a] hover:text-[#15803d]">
                    {article.title}
                  </Link>
                  <p className="text-[11px] text-[#a1a1aa]">/blog/{article.slug}</p>
                </td>
                <td className="px-4 py-3 text-[13px] text-[#71717a]">{article.category?.name || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${article.published ? "bg-[#f0f5f0] text-[#15803d]" : "bg-[#f4f4f5] text-[#71717a]"}`}>
                    {article.published ? "Published" : "Draft"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[13px] text-[#71717a]">
                  {new Date(article.updatedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {articles.length === 0 && (
          <p className="text-center text-[#71717a] text-[14px] py-12">No articles yet.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create article editor client component**

Create `src/app/admin/content/articles/new/article-editor-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TiptapEditor } from "@/components/content/tiptap-editor";
import { createArticle, updateArticle, deleteArticle } from "@/actions/content";
import { slugify, generateExcerpt } from "@/lib/content-helpers";

interface Category {
  id: string;
  name: string;
}

interface Tag {
  id: string;
  name: string;
}

interface ArticleData {
  id?: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  featuredImage: string;
  categoryId: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  published: boolean;
  publishedAt: string;
  tagIds: string[];
}

export function ArticleEditorClient({
  article,
  categories,
  tags,
}: {
  article?: ArticleData;
  categories: Category[];
  tags: Tag[];
}) {
  const router = useRouter();
  const isEdit = !!article?.id;

  const [form, setForm] = useState<ArticleData>({
    title: article?.title || "",
    slug: article?.slug || "",
    body: article?.body || "",
    excerpt: article?.excerpt || "",
    featuredImage: article?.featuredImage || "",
    categoryId: article?.categoryId || "",
    metaTitle: article?.metaTitle || "",
    metaDescription: article?.metaDescription || "",
    ogImage: article?.ogImage || "",
    published: article?.published || false,
    publishedAt: article?.publishedAt || "",
    tagIds: article?.tagIds || [],
  });

  const [saving, setSaving] = useState(false);

  function updateField(field: keyof ArticleData, value: unknown) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "title" && !isEdit) {
        next.slug = slugify(value as string);
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (isEdit && article?.id) {
        await updateArticle(article.id, {
          ...form,
          excerpt: form.excerpt || generateExcerpt(form.body),
        });
      } else {
        await createArticle({
          ...form,
          excerpt: form.excerpt || generateExcerpt(form.body),
        });
      }
      router.push("/admin/content/articles");
      router.refresh();
    } catch (e) {
      alert("Error saving article");
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!article?.id || !confirm("Delete this article?")) return;
    await deleteArticle(article.id);
    router.push("/admin/content/articles");
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">
          {isEdit ? "Edit Article" : "New Article"}
        </h1>
        <div className="flex gap-2">
          {isEdit && (
            <button onClick={handleDelete} className="text-[13px] font-medium text-red-500 px-4 py-2 rounded-lg hover:bg-red-50">
              Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !form.title || !form.slug}
            className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-6">
        {/* Main editor */}
        <div className="space-y-4">
          <input
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="Article title"
            className="w-full text-[20px] font-bold px-4 py-3 border border-[#e4e4e7] rounded-[10px] bg-white"
          />
          <TiptapEditor content={form.body} onChange={(html) => updateField("body", html)} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Publish */}
          <div className="bg-white rounded-[10px] p-4 space-y-3">
            <h3 className="text-[13px] font-bold text-[#1a1a1a]">Publish</h3>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => updateField("published", e.target.checked)}
                className="rounded"
              />
              <span className="text-[13px] text-[#1a1a1a]">Published</span>
            </label>
            <input
              type="datetime-local"
              value={form.publishedAt}
              onChange={(e) => updateField("publishedAt", e.target.value)}
              className="w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg"
            />
          </div>

          {/* Slug */}
          <div className="bg-white rounded-[10px] p-4 space-y-2">
            <label className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa]">Slug</label>
            <input
              value={form.slug}
              onChange={(e) => updateField("slug", e.target.value)}
              className="w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg"
            />
          </div>

          {/* Category */}
          <div className="bg-white rounded-[10px] p-4 space-y-2">
            <label className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa]">Category</label>
            <select
              value={form.categoryId}
              onChange={(e) => updateField("categoryId", e.target.value)}
              className="w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg"
            >
              <option value="">None</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="bg-white rounded-[10px] p-4 space-y-2">
            <label className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa]">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    const ids = form.tagIds.includes(tag.id)
                      ? form.tagIds.filter((id) => id !== tag.id)
                      : [...form.tagIds, tag.id];
                    updateField("tagIds", ids);
                  }}
                  className={`px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    form.tagIds.includes(tag.id)
                      ? "bg-[#15803d] text-white"
                      : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
                  }`}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>

          {/* SEO */}
          <div className="bg-white rounded-[10px] p-4 space-y-3">
            <h3 className="text-[13px] font-bold text-[#1a1a1a]">SEO</h3>
            <div>
              <div className="flex justify-between">
                <label className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa]">Meta Title</label>
                <span className="text-[11px] text-[#a1a1aa]">{form.metaTitle.length}/60</span>
              </div>
              <input
                value={form.metaTitle}
                onChange={(e) => updateField("metaTitle", e.target.value)}
                className="w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg mt-1"
              />
            </div>
            <div>
              <div className="flex justify-between">
                <label className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa]">Meta Description</label>
                <span className="text-[11px] text-[#a1a1aa]">{form.metaDescription.length}/160</span>
              </div>
              <textarea
                value={form.metaDescription}
                onChange={(e) => updateField("metaDescription", e.target.value)}
                rows={3}
                className="w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg mt-1"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa]">Featured Image</label>
              <input
                value={form.featuredImage}
                onChange={(e) => updateField("featuredImage", e.target.value)}
                placeholder="/uploads/content/..."
                className="w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg mt-1"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa]">Excerpt</label>
              <textarea
                value={form.excerpt}
                onChange={(e) => updateField("excerpt", e.target.value)}
                rows={2}
                placeholder="Auto-generated from body if empty"
                className="w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg mt-1"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create new article server page**

Create `src/app/admin/content/articles/new/page.tsx`:

```tsx
import { getCategories, getTags } from "@/actions/content";
import { ArticleEditorClient } from "./article-editor-client";

export default async function NewArticlePage() {
  const [categories, tags] = await Promise.all([getCategories(), getTags()]);
  return <ArticleEditorClient categories={categories} tags={tags} />;
}
```

- [ ] **Step 5: Create edit article server page**

Create `src/app/admin/content/articles/[id]/page.tsx`:

```tsx
import { getArticle, getCategories, getTags } from "@/actions/content";
import { ArticleEditorClient } from "../new/article-editor-client";
import { notFound } from "next/navigation";

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [article, categories, tags] = await Promise.all([
    getArticle(id),
    getCategories(),
    getTags(),
  ]);

  if (!article) notFound();

  return (
    <ArticleEditorClient
      article={{
        id: article.id,
        title: article.title,
        slug: article.slug,
        body: article.body,
        excerpt: article.excerpt || "",
        featuredImage: article.featuredImage || "",
        categoryId: article.categoryId || "",
        metaTitle: article.metaTitle || "",
        metaDescription: article.metaDescription || "",
        ogImage: article.ogImage || "",
        published: article.published,
        publishedAt: article.publishedAt ? new Date(article.publishedAt).toISOString().slice(0, 16) : "",
        tagIds: article.tags.map((t) => t.tagId),
      }}
      categories={categories}
      tags={tags}
    />
  );
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/baralezrah/loan-portal
git add src/app/admin/content/articles/
git commit -m "feat: add article CRUD with Tiptap editor in admin"
```

---

## Task 10: Platform, State, Tool & Comparison Admin Editors

**Files:**
- Create: `src/app/admin/content/platforms/` (page.tsx, platforms-client.tsx, new/page.tsx, new/platform-editor-client.tsx, [id]/page.tsx)
- Create: `src/app/admin/content/states/` (same structure)
- Create: `src/app/admin/content/tools/` (same structure)
- Create: `src/app/admin/content/comparisons/` (same structure)

All structured page editors follow the same pattern as articles but use form fields instead of Tiptap. This task creates all four in one go since they share the same pattern.

- [ ] **Step 1: Create platform pages admin**

Create `src/app/admin/content/platforms/page.tsx`:

```tsx
import { getPlatformPages } from "@/actions/content";
import { PlatformsClient } from "./platforms-client";

export default async function PlatformsPage() {
  const platforms = await getPlatformPages();
  return <PlatformsClient platforms={platforms} />;
}
```

Create `src/app/admin/content/platforms/platforms-client.tsx`:

```tsx
"use client";

import Link from "next/link";

interface PlatformPageItem {
  id: string;
  platformName: string;
  slug: string;
  published: boolean;
  updatedAt: string;
}

export function PlatformsClient({ platforms }: { platforms: PlatformPageItem[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">Platform Pages</h1>
        <Link href="/admin/content/platforms/new" className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534]">
          New Platform Page
        </Link>
      </div>
      <div className="bg-white rounded-[10px] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#f4f4f5]">
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Platform</th>
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Status</th>
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {platforms.map((p) => (
              <tr key={p.id} className="border-b border-[#f4f4f5] last:border-0 hover:bg-[#f8faf8]">
                <td className="px-4 py-3">
                  <Link href={`/admin/content/platforms/${p.id}`} className="text-[13px] font-medium text-[#1a1a1a] hover:text-[#15803d]">
                    {p.platformName}
                  </Link>
                  <p className="text-[11px] text-[#a1a1aa]">/loans-for-{p.slug}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${p.published ? "bg-[#f0f5f0] text-[#15803d]" : "bg-[#f4f4f5] text-[#71717a]"}`}>
                    {p.published ? "Published" : "Draft"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[13px] text-[#71717a]">{new Date(p.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {platforms.length === 0 && <p className="text-center text-[#71717a] text-[14px] py-12">No platform pages yet.</p>}
      </div>
    </div>
  );
}
```

Create `src/app/admin/content/platforms/new/platform-editor-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPlatformPage, updatePlatformPage, deletePlatformPage } from "@/actions/content";
import { slugify } from "@/lib/content-helpers";

interface FaqEntry {
  question: string;
  answer: string;
}

interface PlatformFormData {
  id?: string;
  platformName: string;
  slug: string;
  heroHeadline: string;
  heroSubtext: string;
  platformDescription: string;
  avgEarnings: string;
  topEarnerRange: string;
  loanDetailsHtml: string;
  faqEntries: FaqEntry[];
  ctaText: string;
  ctaSubtext: string;
  metaTitle: string;
  metaDescription: string;
  published: boolean;
}

export function PlatformEditorClient({ platform }: { platform?: PlatformFormData }) {
  const router = useRouter();
  const isEdit = !!platform?.id;
  const [form, setForm] = useState<PlatformFormData>(
    platform || {
      platformName: "", slug: "", heroHeadline: "", heroSubtext: "",
      platformDescription: "", avgEarnings: "", topEarnerRange: "",
      loanDetailsHtml: "", faqEntries: [{ question: "", answer: "" }],
      ctaText: "Apply Now", ctaSubtext: "", metaTitle: "", metaDescription: "", published: false,
    }
  );
  const [saving, setSaving] = useState(false);

  function updateField(field: string, value: unknown) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "platformName" && !isEdit) next.slug = slugify(value as string + "-drivers");
      return next;
    });
  }

  function updateFaq(index: number, field: "question" | "answer", value: string) {
    const faqs = [...form.faqEntries];
    faqs[index] = { ...faqs[index], [field]: value };
    setForm((prev) => ({ ...prev, faqEntries: faqs }));
  }

  function addFaq() {
    setForm((prev) => ({ ...prev, faqEntries: [...prev.faqEntries, { question: "", answer: "" }] }));
  }

  function removeFaq(index: number) {
    setForm((prev) => ({ ...prev, faqEntries: prev.faqEntries.filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    setSaving(true);
    const data = {
      ...form,
      faqEntries: JSON.stringify(form.faqEntries.filter((f) => f.question && f.answer)),
    };
    const { id, ...rest } = data;
    if (isEdit && platform?.id) {
      await updatePlatformPage(platform.id, rest);
    } else {
      await createPlatformPage(rest);
    }
    router.push("/admin/content/platforms");
    router.refresh();
    setSaving(false);
  }

  async function handleDelete() {
    if (!platform?.id || !confirm("Delete this platform page?")) return;
    await deletePlatformPage(platform.id);
    router.push("/admin/content/platforms");
    router.refresh();
  }

  const inputClass = "w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg bg-white";
  const labelClass = "text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-1 block";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">
          {isEdit ? `Edit: ${form.platformName}` : "New Platform Page"}
        </h1>
        <div className="flex gap-2">
          {isEdit && (
            <button onClick={handleDelete} className="text-[13px] font-medium text-red-500 px-4 py-2 rounded-lg hover:bg-red-50">Delete</button>
          )}
          <button onClick={handleSave} disabled={saving || !form.platformName} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534] disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-[10px] p-4 space-y-4">
            <div>
              <label className={labelClass}>Platform Name</label>
              <input value={form.platformName} onChange={(e) => updateField("platformName", e.target.value)} className={inputClass} placeholder="Uber" />
            </div>
            <div>
              <label className={labelClass}>Hero Headline</label>
              <input value={form.heroHeadline} onChange={(e) => updateField("heroHeadline", e.target.value)} className={inputClass} placeholder="Loans for Uber Drivers" />
            </div>
            <div>
              <label className={labelClass}>Hero Subtext</label>
              <textarea value={form.heroSubtext} onChange={(e) => updateField("heroSubtext", e.target.value)} rows={2} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Platform Description</label>
              <textarea value={form.platformDescription} onChange={(e) => updateField("platformDescription", e.target.value)} rows={4} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Avg Earnings</label>
                <input value={form.avgEarnings} onChange={(e) => updateField("avgEarnings", e.target.value)} className={inputClass} placeholder="$45,000/yr" />
              </div>
              <div>
                <label className={labelClass}>Top Earner Range</label>
                <input value={form.topEarnerRange} onChange={(e) => updateField("topEarnerRange", e.target.value)} className={inputClass} placeholder="$80,000-$120,000/yr" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Loan Details</label>
              <textarea value={form.loanDetailsHtml} onChange={(e) => updateField("loanDetailsHtml", e.target.value)} rows={4} className={inputClass} />
            </div>
          </div>

          {/* FAQ Section */}
          <div className="bg-white rounded-[10px] p-4">
            <div className="flex items-center justify-between mb-3">
              <label className={labelClass}>FAQ Entries</label>
              <button type="button" onClick={addFaq} className="text-[12px] text-[#15803d] hover:underline">+ Add FAQ</button>
            </div>
            <div className="space-y-3">
              {form.faqEntries.map((faq, i) => (
                <div key={i} className="border border-[#e4e4e7] rounded-lg p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[11px] text-[#a1a1aa]">Q{i + 1}</span>
                    {form.faqEntries.length > 1 && (
                      <button type="button" onClick={() => removeFaq(i)} className="text-[11px] text-red-400 hover:text-red-600">Remove</button>
                    )}
                  </div>
                  <input value={faq.question} onChange={(e) => updateFaq(i, "question", e.target.value)} placeholder="Question" className={inputClass} />
                  <textarea value={faq.answer} onChange={(e) => updateFaq(i, "answer", e.target.value)} placeholder="Answer" rows={2} className={inputClass} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-[10px] p-4 space-y-3">
            <h3 className="text-[13px] font-bold text-[#1a1a1a]">Publish</h3>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.published} onChange={(e) => updateField("published", e.target.checked)} className="rounded" />
              <span className="text-[13px] text-[#1a1a1a]">Published</span>
            </label>
          </div>
          <div className="bg-white rounded-[10px] p-4 space-y-2">
            <label className={labelClass}>Slug</label>
            <input value={form.slug} onChange={(e) => updateField("slug", e.target.value)} className={inputClass} />
            <p className="text-[11px] text-[#a1a1aa]">URL: /loans-for-{form.slug}</p>
          </div>
          <div className="bg-white rounded-[10px] p-4 space-y-3">
            <h3 className="text-[13px] font-bold text-[#1a1a1a]">SEO</h3>
            <div>
              <div className="flex justify-between"><label className={labelClass}>Meta Title</label><span className="text-[11px] text-[#a1a1aa]">{form.metaTitle.length}/60</span></div>
              <input value={form.metaTitle} onChange={(e) => updateField("metaTitle", e.target.value)} className={inputClass} />
            </div>
            <div>
              <div className="flex justify-between"><label className={labelClass}>Meta Description</label><span className="text-[11px] text-[#a1a1aa]">{form.metaDescription.length}/160</span></div>
              <textarea value={form.metaDescription} onChange={(e) => updateField("metaDescription", e.target.value)} rows={3} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>CTA Text</label>
              <input value={form.ctaText} onChange={(e) => updateField("ctaText", e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

Create `src/app/admin/content/platforms/new/page.tsx`:

```tsx
import { PlatformEditorClient } from "./platform-editor-client";

export default function NewPlatformPage() {
  return <PlatformEditorClient />;
}
```

Create `src/app/admin/content/platforms/[id]/page.tsx`:

```tsx
import { getPlatformPage } from "@/actions/content";
import { PlatformEditorClient } from "../new/platform-editor-client";
import { notFound } from "next/navigation";
import type { FaqEntry } from "@/types/content";

export default async function EditPlatformPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const platform = await getPlatformPage(id);
  if (!platform) notFound();

  return (
    <PlatformEditorClient
      platform={{
        id: platform.id,
        platformName: platform.platformName,
        slug: platform.slug,
        heroHeadline: platform.heroHeadline,
        heroSubtext: platform.heroSubtext,
        platformDescription: platform.platformDescription,
        avgEarnings: platform.avgEarnings || "",
        topEarnerRange: platform.topEarnerRange || "",
        loanDetailsHtml: platform.loanDetailsHtml || "",
        faqEntries: JSON.parse(platform.faqEntries) as FaqEntry[],
        ctaText: platform.ctaText || "Apply Now",
        ctaSubtext: platform.ctaSubtext || "",
        metaTitle: platform.metaTitle || "",
        metaDescription: platform.metaDescription || "",
        published: platform.published,
      }}
    />
  );
}
```

- [ ] **Step 2: Create state pages admin**

Follow the exact same pattern as platforms but with state-specific fields. Create these files:

Create `src/app/admin/content/states/page.tsx`:

```tsx
import { getStatePages } from "@/actions/content";
import { StatesClient } from "./states-client";

export default async function StatesPage() {
  const states = await getStatePages();
  return <StatesClient states={states} />;
}
```

Create `src/app/admin/content/states/states-client.tsx`:

```tsx
"use client";

import Link from "next/link";

interface StatePageItem {
  id: string;
  stateName: string;
  stateCode: string;
  slug: string;
  published: boolean;
  updatedAt: string;
}

export function StatesClient({ states }: { states: StatePageItem[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">State Pages</h1>
        <Link href="/admin/content/states/new" className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534]">
          New State Page
        </Link>
      </div>
      <div className="bg-white rounded-[10px] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#f4f4f5]">
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">State</th>
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Code</th>
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Status</th>
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {states.map((s) => (
              <tr key={s.id} className="border-b border-[#f4f4f5] last:border-0 hover:bg-[#f8faf8]">
                <td className="px-4 py-3">
                  <Link href={`/admin/content/states/${s.id}`} className="text-[13px] font-medium text-[#1a1a1a] hover:text-[#15803d]">{s.stateName}</Link>
                  <p className="text-[11px] text-[#a1a1aa]">/1099-loans-{s.slug}</p>
                </td>
                <td className="px-4 py-3 text-[13px] text-[#71717a]">{s.stateCode}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${s.published ? "bg-[#f0f5f0] text-[#15803d]" : "bg-[#f4f4f5] text-[#71717a]"}`}>
                    {s.published ? "Published" : "Draft"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[13px] text-[#71717a]">{new Date(s.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {states.length === 0 && <p className="text-center text-[#71717a] text-[14px] py-12">No state pages yet.</p>}
      </div>
    </div>
  );
}
```

Create `src/app/admin/content/states/new/state-editor-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStatePage, updateStatePage, deleteStatePage } from "@/actions/content";
import { slugify } from "@/lib/content-helpers";

interface FaqEntry { question: string; answer: string; }
interface LocalStat { label: string; value: string; }

interface StateFormData {
  id?: string;
  stateName: string;
  stateCode: string;
  slug: string;
  heroHeadline: string;
  heroSubtext: string;
  regulationsSummary: string;
  loanAvailability: string;
  localStats: LocalStat[];
  faqEntries: FaqEntry[];
  ctaText: string;
  metaTitle: string;
  metaDescription: string;
  published: boolean;
}

export function StateEditorClient({ state }: { state?: StateFormData }) {
  const router = useRouter();
  const isEdit = !!state?.id;
  const [form, setForm] = useState<StateFormData>(
    state || {
      stateName: "", stateCode: "", slug: "", heroHeadline: "", heroSubtext: "",
      regulationsSummary: "", loanAvailability: "",
      localStats: [{ label: "", value: "" }],
      faqEntries: [{ question: "", answer: "" }],
      ctaText: "Apply Now", metaTitle: "", metaDescription: "", published: false,
    }
  );
  const [saving, setSaving] = useState(false);

  function updateField(field: string, value: unknown) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "stateName" && !isEdit) next.slug = slugify(value as string);
      return next;
    });
  }

  function updateFaq(index: number, field: "question" | "answer", value: string) {
    const faqs = [...form.faqEntries];
    faqs[index] = { ...faqs[index], [field]: value };
    setForm((prev) => ({ ...prev, faqEntries: faqs }));
  }

  function updateStat(index: number, field: "label" | "value", value: string) {
    const stats = [...form.localStats];
    stats[index] = { ...stats[index], [field]: value };
    setForm((prev) => ({ ...prev, localStats: stats }));
  }

  async function handleSave() {
    setSaving(true);
    const data = {
      ...form,
      faqEntries: JSON.stringify(form.faqEntries.filter((f) => f.question && f.answer)),
      localStats: JSON.stringify(form.localStats.filter((s) => s.label && s.value)),
    };
    const { id, ...rest } = data;
    if (isEdit && state?.id) {
      await updateStatePage(state.id, rest);
    } else {
      await createStatePage(rest);
    }
    router.push("/admin/content/states");
    router.refresh();
    setSaving(false);
  }

  async function handleDelete() {
    if (!state?.id || !confirm("Delete this state page?")) return;
    await deleteStatePage(state.id);
    router.push("/admin/content/states");
    router.refresh();
  }

  const inputClass = "w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg bg-white";
  const labelClass = "text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-1 block";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">
          {isEdit ? `Edit: ${form.stateName}` : "New State Page"}
        </h1>
        <div className="flex gap-2">
          {isEdit && <button onClick={handleDelete} className="text-[13px] font-medium text-red-500 px-4 py-2 rounded-lg hover:bg-red-50">Delete</button>}
          <button onClick={handleSave} disabled={saving || !form.stateName} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534] disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-[10px] p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelClass}>State Name</label><input value={form.stateName} onChange={(e) => updateField("stateName", e.target.value)} className={inputClass} placeholder="California" /></div>
              <div><label className={labelClass}>State Code</label><input value={form.stateCode} onChange={(e) => updateField("stateCode", e.target.value.toUpperCase())} className={inputClass} placeholder="CA" maxLength={2} /></div>
            </div>
            <div><label className={labelClass}>Hero Headline</label><input value={form.heroHeadline} onChange={(e) => updateField("heroHeadline", e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Hero Subtext</label><textarea value={form.heroSubtext} onChange={(e) => updateField("heroSubtext", e.target.value)} rows={2} className={inputClass} /></div>
            <div><label className={labelClass}>Regulations Summary</label><textarea value={form.regulationsSummary} onChange={(e) => updateField("regulationsSummary", e.target.value)} rows={4} className={inputClass} /></div>
            <div><label className={labelClass}>Loan Availability</label><textarea value={form.loanAvailability} onChange={(e) => updateField("loanAvailability", e.target.value)} rows={3} className={inputClass} /></div>
          </div>

          {/* Local Stats */}
          <div className="bg-white rounded-[10px] p-4">
            <div className="flex items-center justify-between mb-3">
              <label className={labelClass}>Local Stats</label>
              <button type="button" onClick={() => setForm((p) => ({ ...p, localStats: [...p.localStats, { label: "", value: "" }] }))} className="text-[12px] text-[#15803d] hover:underline">+ Add Stat</button>
            </div>
            <div className="space-y-2">
              {form.localStats.map((stat, i) => (
                <div key={i} className="flex gap-2">
                  <input value={stat.label} onChange={(e) => updateStat(i, "label", e.target.value)} placeholder="Label" className={inputClass} />
                  <input value={stat.value} onChange={(e) => updateStat(i, "value", e.target.value)} placeholder="Value" className={inputClass} />
                  {form.localStats.length > 1 && <button type="button" onClick={() => setForm((p) => ({ ...p, localStats: p.localStats.filter((_, j) => j !== i) }))} className="text-red-400 hover:text-red-600 text-[14px]">×</button>}
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="bg-white rounded-[10px] p-4">
            <div className="flex items-center justify-between mb-3">
              <label className={labelClass}>FAQ Entries</label>
              <button type="button" onClick={() => setForm((p) => ({ ...p, faqEntries: [...p.faqEntries, { question: "", answer: "" }] }))} className="text-[12px] text-[#15803d] hover:underline">+ Add FAQ</button>
            </div>
            <div className="space-y-3">
              {form.faqEntries.map((faq, i) => (
                <div key={i} className="border border-[#e4e4e7] rounded-lg p-3 space-y-2">
                  <div className="flex justify-between"><span className="text-[11px] text-[#a1a1aa]">Q{i + 1}</span>{form.faqEntries.length > 1 && <button type="button" onClick={() => setForm((p) => ({ ...p, faqEntries: p.faqEntries.filter((_, j) => j !== i) }))} className="text-[11px] text-red-400 hover:text-red-600">Remove</button>}</div>
                  <input value={faq.question} onChange={(e) => updateFaq(i, "question", e.target.value)} placeholder="Question" className={inputClass} />
                  <textarea value={faq.answer} onChange={(e) => updateFaq(i, "answer", e.target.value)} placeholder="Answer" rows={2} className={inputClass} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-[10px] p-4 space-y-3">
            <h3 className="text-[13px] font-bold text-[#1a1a1a]">Publish</h3>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.published} onChange={(e) => updateField("published", e.target.checked)} className="rounded" /><span className="text-[13px] text-[#1a1a1a]">Published</span></label>
          </div>
          <div className="bg-white rounded-[10px] p-4 space-y-2">
            <label className={labelClass}>Slug</label>
            <input value={form.slug} onChange={(e) => updateField("slug", e.target.value)} className={inputClass} />
            <p className="text-[11px] text-[#a1a1aa]">URL: /1099-loans-{form.slug}</p>
          </div>
          <div className="bg-white rounded-[10px] p-4 space-y-3">
            <h3 className="text-[13px] font-bold text-[#1a1a1a]">SEO</h3>
            <div><div className="flex justify-between"><label className={labelClass}>Meta Title</label><span className="text-[11px] text-[#a1a1aa]">{form.metaTitle.length}/60</span></div><input value={form.metaTitle} onChange={(e) => updateField("metaTitle", e.target.value)} className={inputClass} /></div>
            <div><div className="flex justify-between"><label className={labelClass}>Meta Description</label><span className="text-[11px] text-[#a1a1aa]">{form.metaDescription.length}/160</span></div><textarea value={form.metaDescription} onChange={(e) => updateField("metaDescription", e.target.value)} rows={3} className={inputClass} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

Create `src/app/admin/content/states/new/page.tsx`:

```tsx
import { StateEditorClient } from "./state-editor-client";

export default function NewStatePage() {
  return <StateEditorClient />;
}
```

Create `src/app/admin/content/states/[id]/page.tsx`:

```tsx
import { getStatePage } from "@/actions/content";
import { StateEditorClient } from "../new/state-editor-client";
import { notFound } from "next/navigation";

export default async function EditStatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getStatePage(id);
  if (!state) notFound();

  return (
    <StateEditorClient
      state={{
        id: state.id,
        stateName: state.stateName,
        stateCode: state.stateCode,
        slug: state.slug,
        heroHeadline: state.heroHeadline,
        heroSubtext: state.heroSubtext,
        regulationsSummary: state.regulationsSummary || "",
        loanAvailability: state.loanAvailability || "",
        localStats: JSON.parse(state.localStats),
        faqEntries: JSON.parse(state.faqEntries),
        ctaText: state.ctaText || "Apply Now",
        metaTitle: state.metaTitle || "",
        metaDescription: state.metaDescription || "",
        published: state.published,
      }}
    />
  );
}
```

- [ ] **Step 3: Create tool pages admin**

Create `src/app/admin/content/tools/page.tsx`:

```tsx
import { getToolPages } from "@/actions/content";
import { ToolsClient } from "./tools-client";

export default async function ToolsAdminPage() {
  const tools = await getToolPages();
  return <ToolsClient tools={tools} />;
}
```

Create `src/app/admin/content/tools/tools-client.tsx`:

```tsx
"use client";

import Link from "next/link";

interface ToolPageItem { id: string; title: string; slug: string; toolComponent: string; published: boolean; updatedAt: string; }

export function ToolsClient({ tools }: { tools: ToolPageItem[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">Tool Pages</h1>
        <Link href="/admin/content/tools/new" className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534]">New Tool Page</Link>
      </div>
      <div className="bg-white rounded-[10px] overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-[#f4f4f5]"><th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Title</th><th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Component</th><th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Status</th></tr></thead>
          <tbody>
            {tools.map((t) => (
              <tr key={t.id} className="border-b border-[#f4f4f5] last:border-0 hover:bg-[#f8faf8]">
                <td className="px-4 py-3"><Link href={`/admin/content/tools/${t.id}`} className="text-[13px] font-medium text-[#1a1a1a] hover:text-[#15803d]">{t.title}</Link><p className="text-[11px] text-[#a1a1aa]">/tools/{t.slug}</p></td>
                <td className="px-4 py-3 text-[13px] text-[#71717a]">{t.toolComponent}</td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${t.published ? "bg-[#f0f5f0] text-[#15803d]" : "bg-[#f4f4f5] text-[#71717a]"}`}>{t.published ? "Published" : "Draft"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {tools.length === 0 && <p className="text-center text-[#71717a] text-[14px] py-12">No tool pages yet.</p>}
      </div>
    </div>
  );
}
```

Create `src/app/admin/content/tools/new/tool-editor-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createToolPage, updateToolPage, deleteToolPage } from "@/actions/content";
import { slugify } from "@/lib/content-helpers";

const TOOL_COMPONENTS = [
  { value: "loan-calculator", label: "Loan Calculator" },
  { value: "income-estimator", label: "Income Estimator" },
  { value: "loan-comparison", label: "Loan Comparison" },
  { value: "dti-calculator", label: "DTI Calculator" },
  { value: "tax-estimator", label: "Tax Estimator" },
];

interface ToolFormData {
  id?: string;
  title: string;
  slug: string;
  description: string;
  toolComponent: string;
  body: string;
  metaTitle: string;
  metaDescription: string;
  published: boolean;
}

export function ToolEditorClient({ tool }: { tool?: ToolFormData }) {
  const router = useRouter();
  const isEdit = !!tool?.id;
  const [form, setForm] = useState<ToolFormData>(
    tool || { title: "", slug: "", description: "", toolComponent: "loan-calculator", body: "", metaTitle: "", metaDescription: "", published: false }
  );
  const [saving, setSaving] = useState(false);

  function updateField(field: string, value: unknown) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "title" && !isEdit) next.slug = slugify(value as string);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    const { id, ...rest } = form;
    if (isEdit && tool?.id) { await updateToolPage(tool.id, rest); }
    else { await createToolPage(rest); }
    router.push("/admin/content/tools");
    router.refresh();
    setSaving(false);
  }

  async function handleDelete() {
    if (!tool?.id || !confirm("Delete this tool page?")) return;
    await deleteToolPage(tool.id);
    router.push("/admin/content/tools");
    router.refresh();
  }

  const inputClass = "w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg bg-white";
  const labelClass = "text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-1 block";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">{isEdit ? `Edit: ${form.title}` : "New Tool Page"}</h1>
        <div className="flex gap-2">
          {isEdit && <button onClick={handleDelete} className="text-[13px] font-medium text-red-500 px-4 py-2 rounded-lg hover:bg-red-50">Delete</button>}
          <button onClick={handleSave} disabled={saving || !form.title} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534] disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_300px] gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-[10px] p-4 space-y-4">
            <div><label className={labelClass}>Title</label><input value={form.title} onChange={(e) => updateField("title", e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Description</label><textarea value={form.description} onChange={(e) => updateField("description", e.target.value)} rows={3} className={inputClass} /></div>
            <div><label className={labelClass}>Tool Component</label><select value={form.toolComponent} onChange={(e) => updateField("toolComponent", e.target.value)} className={inputClass}>{TOOL_COMPONENTS.map((tc) => <option key={tc.value} value={tc.value}>{tc.label}</option>)}</select></div>
            <div><label className={labelClass}>Additional Body Content (HTML)</label><textarea value={form.body} onChange={(e) => updateField("body", e.target.value)} rows={6} className={inputClass} /></div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-[10px] p-4 space-y-3"><h3 className="text-[13px] font-bold text-[#1a1a1a]">Publish</h3><label className="flex items-center gap-2"><input type="checkbox" checked={form.published} onChange={(e) => updateField("published", e.target.checked)} className="rounded" /><span className="text-[13px] text-[#1a1a1a]">Published</span></label></div>
          <div className="bg-white rounded-[10px] p-4 space-y-2"><label className={labelClass}>Slug</label><input value={form.slug} onChange={(e) => updateField("slug", e.target.value)} className={inputClass} /><p className="text-[11px] text-[#a1a1aa]">URL: /tools/{form.slug}</p></div>
          <div className="bg-white rounded-[10px] p-4 space-y-3"><h3 className="text-[13px] font-bold text-[#1a1a1a]">SEO</h3><div><div className="flex justify-between"><label className={labelClass}>Meta Title</label><span className="text-[11px] text-[#a1a1aa]">{form.metaTitle.length}/60</span></div><input value={form.metaTitle} onChange={(e) => updateField("metaTitle", e.target.value)} className={inputClass} /></div><div><div className="flex justify-between"><label className={labelClass}>Meta Description</label><span className="text-[11px] text-[#a1a1aa]">{form.metaDescription.length}/160</span></div><textarea value={form.metaDescription} onChange={(e) => updateField("metaDescription", e.target.value)} rows={3} className={inputClass} /></div></div>
        </div>
      </div>
    </div>
  );
}
```

Create `src/app/admin/content/tools/new/page.tsx`:

```tsx
import { ToolEditorClient } from "./tool-editor-client";

export default function NewToolPage() { return <ToolEditorClient />; }
```

Create `src/app/admin/content/tools/[id]/page.tsx`:

```tsx
import { getToolPage } from "@/actions/content";
import { ToolEditorClient } from "../new/tool-editor-client";
import { notFound } from "next/navigation";

export default async function EditToolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tool = await getToolPage(id);
  if (!tool) notFound();
  return <ToolEditorClient tool={{ id: tool.id, title: tool.title, slug: tool.slug, description: tool.description, toolComponent: tool.toolComponent, body: tool.body || "", metaTitle: tool.metaTitle || "", metaDescription: tool.metaDescription || "", published: tool.published }} />;
}
```

- [ ] **Step 4: Create comparison pages admin**

Create `src/app/admin/content/comparisons/page.tsx`:

```tsx
import { getComparisonPages } from "@/actions/content";
import { ComparisonsClient } from "./comparisons-client";

export default async function ComparisonsPage() {
  const comparisons = await getComparisonPages();
  return <ComparisonsClient comparisons={comparisons} />;
}
```

Create `src/app/admin/content/comparisons/comparisons-client.tsx`:

```tsx
"use client";

import Link from "next/link";

interface ComparisonItem { id: string; title: string; slug: string; entityA: string; entityB: string; published: boolean; updatedAt: string; }

export function ComparisonsClient({ comparisons }: { comparisons: ComparisonItem[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">Comparison Pages</h1>
        <Link href="/admin/content/comparisons/new" className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534]">New Comparison</Link>
      </div>
      <div className="bg-white rounded-[10px] overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-[#f4f4f5]"><th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Title</th><th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Entities</th><th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Status</th></tr></thead>
          <tbody>
            {comparisons.map((c) => (
              <tr key={c.id} className="border-b border-[#f4f4f5] last:border-0 hover:bg-[#f8faf8]">
                <td className="px-4 py-3"><Link href={`/admin/content/comparisons/${c.id}`} className="text-[13px] font-medium text-[#1a1a1a] hover:text-[#15803d]">{c.title}</Link><p className="text-[11px] text-[#a1a1aa]">/compare/{c.slug}</p></td>
                <td className="px-4 py-3 text-[13px] text-[#71717a]">{c.entityA} vs {c.entityB}</td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${c.published ? "bg-[#f0f5f0] text-[#15803d]" : "bg-[#f4f4f5] text-[#71717a]"}`}>{c.published ? "Published" : "Draft"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {comparisons.length === 0 && <p className="text-center text-[#71717a] text-[14px] py-12">No comparison pages yet.</p>}
      </div>
    </div>
  );
}
```

Create `src/app/admin/content/comparisons/new/comparison-editor-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createComparisonPage, updateComparisonPage, deleteComparisonPage } from "@/actions/content";
import { slugify } from "@/lib/content-helpers";

interface FaqEntry { question: string; answer: string; }
interface ComparisonRow { feature: string; entityAValue: string; entityBValue: string; }

interface ComparisonFormData {
  id?: string;
  title: string;
  slug: string;
  entityA: string;
  entityB: string;
  introHtml: string;
  comparisonGrid: ComparisonRow[];
  verdict: string;
  faqEntries: FaqEntry[];
  metaTitle: string;
  metaDescription: string;
  published: boolean;
}

export function ComparisonEditorClient({ comparison }: { comparison?: ComparisonFormData }) {
  const router = useRouter();
  const isEdit = !!comparison?.id;
  const [form, setForm] = useState<ComparisonFormData>(
    comparison || {
      title: "", slug: "", entityA: "", entityB: "", introHtml: "",
      comparisonGrid: [{ feature: "", entityAValue: "", entityBValue: "" }],
      verdict: "", faqEntries: [{ question: "", answer: "" }],
      metaTitle: "", metaDescription: "", published: false,
    }
  );
  const [saving, setSaving] = useState(false);

  function updateField(field: string, value: unknown) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "title" && !isEdit) next.slug = slugify(value as string);
      return next;
    });
  }

  function updateGridRow(index: number, field: keyof ComparisonRow, value: string) {
    const grid = [...form.comparisonGrid];
    grid[index] = { ...grid[index], [field]: value };
    setForm((prev) => ({ ...prev, comparisonGrid: grid }));
  }

  function updateFaq(index: number, field: "question" | "answer", value: string) {
    const faqs = [...form.faqEntries];
    faqs[index] = { ...faqs[index], [field]: value };
    setForm((prev) => ({ ...prev, faqEntries: faqs }));
  }

  async function handleSave() {
    setSaving(true);
    const data = {
      ...form,
      comparisonGrid: JSON.stringify(form.comparisonGrid.filter((r) => r.feature)),
      faqEntries: JSON.stringify(form.faqEntries.filter((f) => f.question && f.answer)),
    };
    const { id, ...rest } = data;
    if (isEdit && comparison?.id) { await updateComparisonPage(comparison.id, rest); }
    else { await createComparisonPage(rest); }
    router.push("/admin/content/comparisons");
    router.refresh();
    setSaving(false);
  }

  async function handleDelete() {
    if (!comparison?.id || !confirm("Delete?")) return;
    await deleteComparisonPage(comparison.id);
    router.push("/admin/content/comparisons");
    router.refresh();
  }

  const inputClass = "w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg bg-white";
  const labelClass = "text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-1 block";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">{isEdit ? `Edit: ${form.title}` : "New Comparison"}</h1>
        <div className="flex gap-2">
          {isEdit && <button onClick={handleDelete} className="text-[13px] font-medium text-red-500 px-4 py-2 rounded-lg hover:bg-red-50">Delete</button>}
          <button onClick={handleSave} disabled={saving || !form.title} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534] disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_300px] gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-[10px] p-4 space-y-4">
            <div><label className={labelClass}>Title</label><input value={form.title} onChange={(e) => updateField("title", e.target.value)} className={inputClass} placeholder="LimeCredit vs Fundo" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelClass}>Entity A</label><input value={form.entityA} onChange={(e) => updateField("entityA", e.target.value)} className={inputClass} placeholder="LimeCredit" /></div>
              <div><label className={labelClass}>Entity B</label><input value={form.entityB} onChange={(e) => updateField("entityB", e.target.value)} className={inputClass} placeholder="Fundo" /></div>
            </div>
            <div><label className={labelClass}>Introduction</label><textarea value={form.introHtml} onChange={(e) => updateField("introHtml", e.target.value)} rows={4} className={inputClass} /></div>
          </div>

          {/* Comparison Grid */}
          <div className="bg-white rounded-[10px] p-4">
            <div className="flex items-center justify-between mb-3">
              <label className={labelClass}>Comparison Grid</label>
              <button type="button" onClick={() => setForm((p) => ({ ...p, comparisonGrid: [...p.comparisonGrid, { feature: "", entityAValue: "", entityBValue: "" }] }))} className="text-[12px] text-[#15803d] hover:underline">+ Add Row</button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_24px] gap-2 text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa]">
                <span>Feature</span><span>{form.entityA || "A"}</span><span>{form.entityB || "B"}</span><span></span>
              </div>
              {form.comparisonGrid.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_24px] gap-2">
                  <input value={row.feature} onChange={(e) => updateGridRow(i, "feature", e.target.value)} className={inputClass} placeholder="Feature" />
                  <input value={row.entityAValue} onChange={(e) => updateGridRow(i, "entityAValue", e.target.value)} className={inputClass} />
                  <input value={row.entityBValue} onChange={(e) => updateGridRow(i, "entityBValue", e.target.value)} className={inputClass} />
                  {form.comparisonGrid.length > 1 && <button type="button" onClick={() => setForm((p) => ({ ...p, comparisonGrid: p.comparisonGrid.filter((_, j) => j !== i) }))} className="text-red-400 hover:text-red-600">×</button>}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[10px] p-4 space-y-4">
            <div><label className={labelClass}>Verdict</label><textarea value={form.verdict} onChange={(e) => updateField("verdict", e.target.value)} rows={4} className={inputClass} /></div>
          </div>

          {/* FAQ */}
          <div className="bg-white rounded-[10px] p-4">
            <div className="flex items-center justify-between mb-3">
              <label className={labelClass}>FAQ</label>
              <button type="button" onClick={() => setForm((p) => ({ ...p, faqEntries: [...p.faqEntries, { question: "", answer: "" }] }))} className="text-[12px] text-[#15803d] hover:underline">+ Add FAQ</button>
            </div>
            <div className="space-y-3">
              {form.faqEntries.map((faq, i) => (
                <div key={i} className="border border-[#e4e4e7] rounded-lg p-3 space-y-2">
                  <input value={faq.question} onChange={(e) => updateFaq(i, "question", e.target.value)} placeholder="Question" className={inputClass} />
                  <textarea value={faq.answer} onChange={(e) => updateFaq(i, "answer", e.target.value)} placeholder="Answer" rows={2} className={inputClass} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-[10px] p-4 space-y-3"><h3 className="text-[13px] font-bold text-[#1a1a1a]">Publish</h3><label className="flex items-center gap-2"><input type="checkbox" checked={form.published} onChange={(e) => updateField("published", e.target.checked)} className="rounded" /><span className="text-[13px] text-[#1a1a1a]">Published</span></label></div>
          <div className="bg-white rounded-[10px] p-4 space-y-2"><label className={labelClass}>Slug</label><input value={form.slug} onChange={(e) => updateField("slug", e.target.value)} className={inputClass} /><p className="text-[11px] text-[#a1a1aa]">URL: /compare/{form.slug}</p></div>
          <div className="bg-white rounded-[10px] p-4 space-y-3"><h3 className="text-[13px] font-bold text-[#1a1a1a]">SEO</h3><div><div className="flex justify-between"><label className={labelClass}>Meta Title</label><span className="text-[11px] text-[#a1a1aa]">{form.metaTitle.length}/60</span></div><input value={form.metaTitle} onChange={(e) => updateField("metaTitle", e.target.value)} className={inputClass} /></div><div><div className="flex justify-between"><label className={labelClass}>Meta Description</label><span className="text-[11px] text-[#a1a1aa]">{form.metaDescription.length}/160</span></div><textarea value={form.metaDescription} onChange={(e) => updateField("metaDescription", e.target.value)} rows={3} className={inputClass} /></div></div>
        </div>
      </div>
    </div>
  );
}
```

Create `src/app/admin/content/comparisons/new/page.tsx`:

```tsx
import { ComparisonEditorClient } from "./comparison-editor-client";

export default function NewComparisonPage() { return <ComparisonEditorClient />; }
```

Create `src/app/admin/content/comparisons/[id]/page.tsx`:

```tsx
import { getComparisonPage } from "@/actions/content";
import { ComparisonEditorClient } from "../new/comparison-editor-client";
import { notFound } from "next/navigation";

export default async function EditComparisonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comp = await getComparisonPage(id);
  if (!comp) notFound();
  return <ComparisonEditorClient comparison={{ id: comp.id, title: comp.title, slug: comp.slug, entityA: comp.entityA, entityB: comp.entityB, introHtml: comp.introHtml || "", comparisonGrid: JSON.parse(comp.comparisonGrid), verdict: comp.verdict || "", faqEntries: JSON.parse(comp.faqEntries), metaTitle: comp.metaTitle || "", metaDescription: comp.metaDescription || "", published: comp.published }} />;
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/baralezrah/loan-portal
git add src/app/admin/content/platforms/ src/app/admin/content/states/ src/app/admin/content/tools/ src/app/admin/content/comparisons/
git commit -m "feat: add platform, state, tool, and comparison page admin editors"
```

---

## Task 11: Public Content Page Templates

**Files:**
- Create: `src/components/content/faq-accordion.tsx`
- Create: `src/components/content/related-content.tsx`
- Create: `src/components/content/content-cta.tsx`
- Create: `src/components/content/table-of-contents.tsx`
- Create: `src/components/content/article-card.tsx`
- Create: `src/app/(public)/blog/page.tsx`
- Create: `src/app/(public)/blog/blog-client.tsx`
- Create: `src/app/(public)/blog/[slug]/page.tsx`
- Create: `src/app/(public)/blog/category/[slug]/page.tsx`
- Create: `src/app/(public)/loans-for-[slug]/page.tsx`
- Create: `src/app/(public)/1099-loans-[slug]/page.tsx`
- Create: `src/app/(public)/tools/[slug]/page.tsx`
- Create: `src/app/(public)/compare/[slug]/page.tsx`
- Create: `src/components/homepage/navbar.tsx`
- Create: `src/components/homepage/footer.tsx`
- Create: `src/app/(public)/layout.tsx`

This is a large task — it creates all the public-facing content templates. Each follows the same pattern: server component fetches data, renders structured HTML with SEO components.

- [ ] **Step 1: Create shared content components**

Create `src/components/content/faq-accordion.tsx`:

```tsx
"use client";

import { useState } from "react";
import { JsonLd, faqSchema } from "@/components/seo/json-ld";

interface FaqEntry { question: string; answer: string; }

export function FaqAccordion({ entries }: { entries: FaqEntry[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!entries.length) return null;

  return (
    <section className="mt-12">
      <JsonLd data={faqSchema(entries)} />
      <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[#1a1a1a] mb-4">Frequently Asked Questions</h2>
      <div className="space-y-2">
        {entries.map((entry, i) => (
          <div key={i} className="border border-[#e4e4e7] rounded-lg overflow-hidden">
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full flex items-center justify-between px-4 py-3 text-left text-[14px] font-medium text-[#1a1a1a] hover:bg-[#f8faf8]"
            >
              {entry.question}
              <span className="text-[#71717a] text-[18px]">{openIndex === i ? "−" : "+"}</span>
            </button>
            {openIndex === i && (
              <div className="px-4 pb-3 text-[14px] text-[#71717a] leading-relaxed">{entry.answer}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
```

Create `src/components/content/content-cta.tsx`:

```tsx
import Link from "next/link";

export function ContentCta({ text, subtext }: { text?: string; subtext?: string }) {
  return (
    <section className="mt-12 bg-[#f0f5f0] rounded-[10px] p-8 text-center">
      <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[#1a1a1a] mb-2">
        {text || "Ready to Get Funded?"}
      </h2>
      <p className="text-[14px] text-[#71717a] mb-4">
        {subtext || "Apply in 5 minutes. No credit checks. Get funded in hours."}
      </p>
      <Link
        href="/apply"
        className="inline-block bg-[#15803d] text-white text-[14px] font-medium px-6 py-3 rounded-lg hover:bg-[#166534] transition-colors"
      >
        Apply Now
      </Link>
    </section>
  );
}
```

Create `src/components/content/table-of-contents.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

interface TocItem { id: string; text: string; level: number; }

export function TableOfContents({ html }: { html: string }) {
  const [items, setItems] = useState<TocItem[]>([]);

  useEffect(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const headings = doc.querySelectorAll("h2, h3");
    const tocItems: TocItem[] = [];
    headings.forEach((h) => {
      const id = h.textContent?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "";
      tocItems.push({ id, text: h.textContent || "", level: h.tagName === "H2" ? 2 : 3 });
    });
    setItems(tocItems);
  }, [html]);

  if (items.length < 3) return null;

  return (
    <nav className="bg-[#f8faf8] rounded-[10px] p-4 mb-8">
      <h3 className="text-[13px] font-bold text-[#1a1a1a] mb-2">Table of Contents</h3>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className={item.level === 3 ? "ml-4" : ""}>
            <a href={`#${item.id}`} className="text-[13px] text-[#15803d] hover:underline">{item.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

Create `src/components/content/article-card.tsx`:

```tsx
import Link from "next/link";
import Image from "next/image";

interface ArticleCardProps {
  title: string;
  slug: string;
  excerpt: string | null;
  featuredImage: string | null;
  publishedAt: string | null;
  categoryName?: string | null;
}

export function ArticleCard({ title, slug, excerpt, featuredImage, publishedAt, categoryName }: ArticleCardProps) {
  return (
    <Link href={`/blog/${slug}`} className="group block bg-white rounded-[10px] overflow-hidden hover:shadow-md transition-shadow">
      {featuredImage && (
        <div className="aspect-video relative bg-[#f4f4f5]">
          <Image src={featuredImage} alt={title} fill className="object-cover" />
        </div>
      )}
      <div className="p-4">
        {categoryName && <span className="text-[11px] uppercase tracking-[0.05em] text-[#15803d] font-medium">{categoryName}</span>}
        <h3 className="text-[15px] font-bold text-[#1a1a1a] mt-1 group-hover:text-[#15803d] transition-colors">{title}</h3>
        {excerpt && <p className="text-[13px] text-[#71717a] mt-1 line-clamp-2">{excerpt}</p>}
        {publishedAt && <p className="text-[11px] text-[#a1a1aa] mt-2">{new Date(publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create public layout with navbar and footer**

Create `src/components/homepage/navbar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#e4e4e7]">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="font-extrabold text-[15px] tracking-[-0.03em]">
          Lime<span className="text-[#15803d]">Credit</span>
        </Link>
        <div className="hidden md:flex items-center gap-6">
          <Link href="/blog" className="text-[13px] text-[#71717a] hover:text-[#1a1a1a]">Blog</Link>
          <Link href="/tools/loan-calculator" className="text-[13px] text-[#71717a] hover:text-[#1a1a1a]">Tools</Link>
          <Link href="/apply" className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534]">Apply Now</Link>
        </div>
        <button onClick={() => setOpen(!open)} className="md:hidden text-[#1a1a1a]">
          <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-[#e4e4e7] px-4 py-3 space-y-2 bg-white">
          <Link href="/blog" className="block text-[13px] text-[#71717a] py-1">Blog</Link>
          <Link href="/tools/loan-calculator" className="block text-[13px] text-[#71717a] py-1">Tools</Link>
          <Link href="/apply" className="block bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg text-center mt-2">Apply Now</Link>
        </div>
      )}
    </nav>
  );
}
```

Create `src/components/homepage/footer.tsx`:

```tsx
import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-[#1a1a1a] text-white py-16">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <span className="font-extrabold text-[15px] tracking-[-0.03em]">Lime<span className="text-[#4ade80]">Credit</span></span>
            <p className="text-[13px] text-[#a1a1aa] mt-2">Fast loans for gig workers. $100 to $10,000.</p>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-3">Company</h4>
            <div className="space-y-2">
              <Link href="/blog" className="block text-[13px] text-[#d4d4d8] hover:text-white">Blog</Link>
              <Link href="/apply" className="block text-[13px] text-[#d4d4d8] hover:text-white">Apply</Link>
              <Link href="/status" className="block text-[13px] text-[#d4d4d8] hover:text-white">Check Status</Link>
            </div>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-3">Resources</h4>
            <div className="space-y-2">
              <Link href="/tools/loan-calculator" className="block text-[13px] text-[#d4d4d8] hover:text-white">Loan Calculator</Link>
              <Link href="/blog/category/guides" className="block text-[13px] text-[#d4d4d8] hover:text-white">Guides</Link>
              <Link href="/compare/limecredit-vs-fundo" className="block text-[13px] text-[#d4d4d8] hover:text-white">Comparisons</Link>
            </div>
          </div>
          <div>
            <h4 className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-3">Legal</h4>
            <div className="space-y-2">
              <Link href="/privacy" className="block text-[13px] text-[#d4d4d8] hover:text-white">Privacy Policy</Link>
              <Link href="/terms" className="block text-[13px] text-[#d4d4d8] hover:text-white">Terms of Service</Link>
              <Link href="/disclosures" className="block text-[13px] text-[#d4d4d8] hover:text-white">Disclosures</Link>
            </div>
          </div>
        </div>
        <div className="mt-12 pt-6 border-t border-[#333] text-[12px] text-[#71717a]">
          &copy; {new Date().getFullYear()} LimeCredit. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
```

Create `src/app/(public)/layout.tsx`:

```tsx
import { Navbar } from "@/components/homepage/navbar";
import { Footer } from "@/components/homepage/footer";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="pt-14 min-h-screen">{children}</main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 3: Create blog index page**

Create `src/app/(public)/blog/page.tsx`:

```tsx
import { getPublishedArticles, getCategories } from "@/actions/content";
import { ArticleCard } from "@/components/content/article-card";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { generateMeta } from "@/lib/seo";
import Link from "next/link";

export const metadata = generateMeta({ title: "Blog", description: "Guides, tips, and resources for gig workers and 1099 contractors seeking loans." });

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const currentPage = parseInt(page || "1", 10);
  const [{ articles, totalPages }, categories] = await Promise.all([
    getPublishedArticles(undefined, currentPage),
    getCategories(),
  ]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }]} />
      <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-2">Blog</h1>
      <p className="text-[14px] text-[#71717a] mb-6">Guides, tips, and resources for gig workers.</p>

      <div className="flex gap-3 mb-8">
        <Link href="/blog" className="text-[13px] font-medium px-3 py-1.5 rounded-full bg-[#15803d] text-white">All</Link>
        {categories.map((cat) => (
          <Link key={cat.id} href={`/blog/category/${cat.slug}`} className="text-[13px] font-medium px-3 py-1.5 rounded-full bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]">
            {cat.name}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {articles.map((article) => (
          <ArticleCard
            key={article.id}
            title={article.title}
            slug={article.slug}
            excerpt={article.excerpt}
            featuredImage={article.featuredImage}
            publishedAt={article.publishedAt?.toISOString() || null}
            categoryName={article.category?.name}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }, (_, i) => (
            <Link
              key={i}
              href={`/blog?page=${i + 1}`}
              className={`px-3 py-1.5 rounded text-[13px] ${currentPage === i + 1 ? "bg-[#15803d] text-white" : "bg-[#f4f4f5] text-[#71717a]"}`}
            >
              {i + 1}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create article detail page**

Create `src/app/(public)/blog/[slug]/page.tsx`:

```tsx
import { getArticleBySlug, getPublishedArticles } from "@/actions/content";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd, articleSchema } from "@/components/seo/json-ld";
import { TableOfContents } from "@/components/content/table-of-contents";
import { ContentCta } from "@/components/content/content-cta";
import { ArticleCard } from "@/components/content/article-card";
import { generateMeta } from "@/lib/seo";
import Image from "next/image";
import type { Metadata } from "next";

export async function generateStaticParams() {
  const { articles } = await getPublishedArticles(undefined, 1, 1000);
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return {};
  return generateMeta({
    title: article.metaTitle || article.title,
    description: article.metaDescription || article.excerpt || "",
    ogImage: article.ogImage || article.featuredImage,
    type: "article",
  });
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article || !article.published) notFound();

  const { articles: related } = await getPublishedArticles(undefined, 1, 4);
  const relatedFiltered = related.filter((a) => a.id !== article.id).slice(0, 3);

  const bodyWithIds = article.body.replace(
    /<(h[23])>(.*?)<\/\1>/g,
    (_, tag, text) => {
      const id = text.toLowerCase().replace(/<[^>]*>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return `<${tag} id="${id}">${text}</${tag}>`;
    }
  );

  const readTime = Math.max(1, Math.ceil(article.body.replace(/<[^>]*>/g, "").split(/\s+/).length / 200));

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <JsonLd data={articleSchema(article)} />
      <Breadcrumbs items={[
        { label: "Home", href: "/" },
        { label: "Blog", href: "/blog" },
        ...(article.category ? [{ label: article.category.name, href: `/blog/category/${article.category.slug}` }] : []),
        { label: article.title, href: `/blog/${article.slug}` },
      ]} />

      <header className="mb-8">
        {article.category && <span className="text-[11px] uppercase tracking-[0.05em] text-[#15803d] font-medium">{article.category.name}</span>}
        <h1 className="text-[32px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-1 leading-tight">{article.title}</h1>
        <div className="flex items-center gap-3 mt-3 text-[13px] text-[#71717a]">
          {article.publishedAt && <span>{new Date(article.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>}
          <span>·</span>
          <span>{readTime} min read</span>
        </div>
      </header>

      {article.featuredImage && (
        <div className="aspect-video relative rounded-[10px] overflow-hidden mb-8">
          <Image src={article.featuredImage} alt={article.title} fill className="object-cover" />
        </div>
      )}

      <TableOfContents html={article.body} />

      <article
        className="prose prose-lg max-w-none prose-headings:font-extrabold prose-headings:tracking-[-0.02em] prose-a:text-[#15803d]"
        dangerouslySetInnerHTML={{ __html: bodyWithIds }}
      />

      <ContentCta />

      {relatedFiltered.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[#1a1a1a] mb-4">Related Articles</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {relatedFiltered.map((a) => (
              <ArticleCard key={a.id} title={a.title} slug={a.slug} excerpt={a.excerpt} featuredImage={a.featuredImage} publishedAt={a.publishedAt?.toISOString() || null} categoryName={a.category?.name} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create category archive page**

Create `src/app/(public)/blog/category/[slug]/page.tsx`:

```tsx
import { getPublishedArticles, getCategories } from "@/actions/content";
import { ArticleCard } from "@/components/content/article-card";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const categories = await getCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) return {};
  return generateMeta({ title: category.name, description: category.description || `Articles about ${category.name}` });
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }) {
  const { slug } = await params;
  const { page } = await searchParams;
  const currentPage = parseInt(page || "1", 10);
  const categories = await getCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();

  const { articles, totalPages } = await getPublishedArticles(slug, currentPage);

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }, { label: category.name, href: `/blog/category/${slug}` }]} />
      <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-2">{category.name}</h1>
      {category.description && <p className="text-[14px] text-[#71717a] mb-8">{category.description}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {articles.map((article) => (
          <ArticleCard key={article.id} title={article.title} slug={article.slug} excerpt={article.excerpt} featuredImage={article.featuredImage} publishedAt={article.publishedAt?.toISOString() || null} />
        ))}
      </div>
      {articles.length === 0 && <p className="text-[14px] text-[#71717a] py-12 text-center">No articles in this category yet.</p>}
    </div>
  );
}
```

- [ ] **Step 6: Create platform page template**

Create `src/app/(public)/loans-for-[slug]/page.tsx`:

```tsx
import { getPlatformPageBySlug, getPublishedPlatformPages } from "@/actions/content";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd, loanProductSchema, faqSchema } from "@/components/seo/json-ld";
import { FaqAccordion } from "@/components/content/faq-accordion";
import { ContentCta } from "@/components/content/content-cta";
import { generateMeta } from "@/lib/seo";
import Link from "next/link";
import type { Metadata } from "next";
import type { FaqEntry } from "@/types/content";

export async function generateStaticParams() {
  const platforms = await getPublishedPlatformPages();
  return platforms.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const platform = await getPlatformPageBySlug(slug);
  if (!platform) return {};
  return generateMeta({
    title: platform.metaTitle || `Loans for ${platform.platformName} Workers`,
    description: platform.metaDescription || platform.heroSubtext,
  });
}

export default async function PlatformPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const platform = await getPlatformPageBySlug(slug);
  if (!platform || !platform.published) notFound();

  const faqs: FaqEntry[] = JSON.parse(platform.faqEntries);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <JsonLd data={loanProductSchema()} />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: platform.platformName, href: `/loans-for-${platform.slug}` }]} />

      <header className="mb-8">
        <h1 className="text-[32px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] leading-tight">{platform.heroHeadline}</h1>
        <p className="text-[16px] text-[#71717a] mt-2">{platform.heroSubtext}</p>
        <Link href="/apply" className="inline-block mt-4 bg-[#15803d] text-white text-[14px] font-medium px-6 py-3 rounded-lg hover:bg-[#166534]">
          {platform.ctaText || "Apply Now"}
        </Link>
      </header>

      <section className="mb-8">
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[#1a1a1a] mb-3">About {platform.platformName} Loans</h2>
        <p className="text-[14px] text-[#71717a] leading-relaxed">{platform.platformDescription}</p>
      </section>

      {(platform.avgEarnings || platform.topEarnerRange) && (
        <section className="grid grid-cols-2 gap-4 mb-8">
          {platform.avgEarnings && (
            <div className="bg-[#f0f5f0] rounded-[10px] p-4">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Avg Earnings</p>
              <p className="text-[22px] font-extrabold text-[#1a1a1a]">{platform.avgEarnings}</p>
            </div>
          )}
          {platform.topEarnerRange && (
            <div className="bg-[#f0f5f0] rounded-[10px] p-4">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">Top Earners</p>
              <p className="text-[22px] font-extrabold text-[#1a1a1a]">{platform.topEarnerRange}</p>
            </div>
          )}
        </section>
      )}

      {platform.loanDetailsHtml && (
        <section className="mb-8">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[#1a1a1a] mb-3">Loan Details</h2>
          <div className="text-[14px] text-[#71717a] leading-relaxed" dangerouslySetInnerHTML={{ __html: platform.loanDetailsHtml }} />
        </section>
      )}

      <FaqAccordion entries={faqs} />
      <ContentCta text={platform.ctaText || undefined} subtext={platform.ctaSubtext || undefined} />
    </div>
  );
}
```

- [ ] **Step 7: Create state page template**

Create `src/app/(public)/1099-loans-[slug]/page.tsx`:

```tsx
import { getStatePageBySlug, getPublishedStatePages } from "@/actions/content";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd, loanProductSchema } from "@/components/seo/json-ld";
import { FaqAccordion } from "@/components/content/faq-accordion";
import { ContentCta } from "@/components/content/content-cta";
import { generateMeta } from "@/lib/seo";
import Link from "next/link";
import type { Metadata } from "next";
import type { FaqEntry, LocalStat } from "@/types/content";

export async function generateStaticParams() {
  const states = await getPublishedStatePages();
  return states.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const state = await getStatePageBySlug(slug);
  if (!state) return {};
  return generateMeta({
    title: state.metaTitle || `1099 Loans in ${state.stateName}`,
    description: state.metaDescription || state.heroSubtext,
  });
}

export default async function StatePageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const state = await getStatePageBySlug(slug);
  if (!state || !state.published) notFound();

  const faqs: FaqEntry[] = JSON.parse(state.faqEntries);
  const stats: LocalStat[] = JSON.parse(state.localStats);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <JsonLd data={loanProductSchema()} />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: `${state.stateName}`, href: `/1099-loans-${state.slug}` }]} />

      <header className="mb-8">
        <h1 className="text-[32px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] leading-tight">{state.heroHeadline}</h1>
        <p className="text-[16px] text-[#71717a] mt-2">{state.heroSubtext}</p>
        <Link href="/apply" className="inline-block mt-4 bg-[#15803d] text-white text-[14px] font-medium px-6 py-3 rounded-lg hover:bg-[#166534]">
          {state.ctaText || "Apply Now"}
        </Link>
      </header>

      {stats.length > 0 && (
        <section className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {stats.map((stat, i) => (
            <div key={i} className="bg-[#f0f5f0] rounded-[10px] p-4">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a]">{stat.label}</p>
              <p className="text-[18px] font-extrabold text-[#1a1a1a]">{stat.value}</p>
            </div>
          ))}
        </section>
      )}

      {state.regulationsSummary && (
        <section className="mb-8">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[#1a1a1a] mb-3">Lending Regulations in {state.stateName}</h2>
          <p className="text-[14px] text-[#71717a] leading-relaxed">{state.regulationsSummary}</p>
        </section>
      )}

      {state.loanAvailability && (
        <section className="mb-8">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-[#1a1a1a] mb-3">Loan Availability</h2>
          <p className="text-[14px] text-[#71717a] leading-relaxed">{state.loanAvailability}</p>
        </section>
      )}

      <FaqAccordion entries={faqs} />
      <ContentCta />
    </div>
  );
}
```

- [ ] **Step 8: Create tool page and comparison page templates**

Create `src/app/(public)/tools/[slug]/page.tsx`:

```tsx
import { getToolPageBySlug, getPublishedToolPages } from "@/actions/content";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { ContentCta } from "@/components/content/content-cta";
import { generateMeta } from "@/lib/seo";
import dynamic from "next/dynamic";
import type { Metadata } from "next";

const toolComponents: Record<string, React.ComponentType> = {
  "loan-calculator": dynamic(() => import("@/components/tools/loan-calculator").then((m) => m.LoanCalculator)),
  "income-estimator": dynamic(() => import("@/components/tools/income-estimator").then((m) => m.IncomeEstimator)),
  "loan-comparison": dynamic(() => import("@/components/tools/loan-comparison").then((m) => m.LoanComparison)),
  "dti-calculator": dynamic(() => import("@/components/tools/dti-calculator").then((m) => m.DtiCalculator)),
  "tax-estimator": dynamic(() => import("@/components/tools/tax-estimator").then((m) => m.TaxEstimator)),
};

export async function generateStaticParams() {
  const tools = await getPublishedToolPages();
  return tools.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tool = await getToolPageBySlug(slug);
  if (!tool) return {};
  return generateMeta({ title: tool.metaTitle || tool.title, description: tool.metaDescription || tool.description });
}

export default async function ToolPageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = await getToolPageBySlug(slug);
  if (!tool || !tool.published) notFound();

  const ToolComponent = toolComponents[tool.toolComponent];

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Tools", href: "/tools/loan-calculator" }, { label: tool.title, href: `/tools/${tool.slug}` }]} />
      <h1 className="text-[32px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-2">{tool.title}</h1>
      <p className="text-[14px] text-[#71717a] mb-8">{tool.description}</p>
      {ToolComponent ? <ToolComponent /> : <p className="text-[#71717a]">Tool not available.</p>}
      {tool.body && <div className="mt-8 prose max-w-none" dangerouslySetInnerHTML={{ __html: tool.body }} />}
      <ContentCta />
    </div>
  );
}
```

Create `src/app/(public)/compare/[slug]/page.tsx`:

```tsx
import { getComparisonPageBySlug, getPublishedComparisonPages } from "@/actions/content";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { FaqAccordion } from "@/components/content/faq-accordion";
import { ContentCta } from "@/components/content/content-cta";
import { generateMeta } from "@/lib/seo";
import type { Metadata } from "next";
import type { FaqEntry, ComparisonRow } from "@/types/content";

export async function generateStaticParams() {
  const comparisons = await getPublishedComparisonPages();
  return comparisons.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const comp = await getComparisonPageBySlug(slug);
  if (!comp) return {};
  return generateMeta({ title: comp.metaTitle || comp.title, description: comp.metaDescription || `Compare ${comp.entityA} vs ${comp.entityB}` });
}

export default async function ComparisonPageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comp = await getComparisonPageBySlug(slug);
  if (!comp || !comp.published) notFound();

  const grid: ComparisonRow[] = JSON.parse(comp.comparisonGrid);
  const faqs: FaqEntry[] = JSON.parse(comp.faqEntries);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Compare", href: `/compare/${comp.slug}` }, { label: comp.title, href: `/compare/${comp.slug}` }]} />
      <h1 className="text-[32px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-4">{comp.title}</h1>
      {comp.introHtml && <div className="text-[14px] text-[#71717a] leading-relaxed mb-8" dangerouslySetInnerHTML={{ __html: comp.introHtml }} />}

      {grid.length > 0 && (
        <div className="overflow-x-auto mb-8">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#f0f5f0]">
                <th className="text-left text-[13px] font-bold text-[#1a1a1a] px-4 py-3">Feature</th>
                <th className="text-left text-[13px] font-bold text-[#15803d] px-4 py-3">{comp.entityA}</th>
                <th className="text-left text-[13px] font-bold text-[#71717a] px-4 py-3">{comp.entityB}</th>
              </tr>
            </thead>
            <tbody>
              {grid.map((row, i) => (
                <tr key={i} className="border-b border-[#e4e4e7]">
                  <td className="text-[13px] font-medium text-[#1a1a1a] px-4 py-3">{row.feature}</td>
                  <td className="text-[13px] text-[#71717a] px-4 py-3">{row.entityAValue}</td>
                  <td className="text-[13px] text-[#71717a] px-4 py-3">{row.entityBValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {comp.verdict && (
        <section className="bg-[#f0f5f0] rounded-[10px] p-6 mb-8">
          <h2 className="text-[18px] font-extrabold text-[#1a1a1a] mb-2">Our Verdict</h2>
          <p className="text-[14px] text-[#71717a] leading-relaxed">{comp.verdict}</p>
        </section>
      )}

      <FaqAccordion entries={faqs} />
      <ContentCta />
    </div>
  );
}
```

- [ ] **Step 9: Commit**

```bash
cd /Users/baralezrah/loan-portal
git add src/components/content/ src/components/homepage/ src/app/\(public\)/
git commit -m "feat: add public content page templates, navbar, footer, and shared components"
```

---

## Task 12: Interactive Tool Components

**Files:**
- Create: `src/components/tools/loan-calculator.tsx`
- Create: `src/components/tools/income-estimator.tsx`
- Create: `src/components/tools/loan-comparison.tsx`
- Create: `src/components/tools/dti-calculator.tsx`
- Create: `src/components/tools/tax-estimator.tsx`

Each tool is a self-contained client component with inputs, calculations, and results display. All follow the same style patterns.

- [ ] **Step 1: Create all 5 tool components**

The implementing agent should create each tool component as a `"use client"` component with:
- Input controls (sliders, number inputs, dropdowns)
- Real-time calculation on state change
- Results display with the Sage & Stone color palette
- LimeCredit CTA link at the bottom
- Styled with existing Tailwind patterns: `bg-white rounded-[10px]`, `text-[13px]`, `text-[#15803d]` for accents

**Loan Calculator** (`src/components/tools/loan-calculator.tsx`): Amount slider ($500-$10,000), term selector (3-18 months), APR range (30-60%). Outputs: monthly payment, total interest, total cost. Formula: standard amortization from `src/lib/amortization.ts`.

**Income Estimator** (`src/components/tools/income-estimator.tsx`): Multi-select gig platforms, hours/week input, calculates estimated annual income and loan eligibility range based on income.

**Loan Comparison** (`src/components/tools/loan-comparison.tsx`): Side-by-side comparison of LimeCredit (30-60% APR, no credit check, 48h funding) vs typical MCA (factor rate 1.2-1.5, daily repayment) vs traditional bank loan (8-36% APR, credit check, weeks to fund). Static informational component.

**DTI Calculator** (`src/components/tools/dti-calculator.tsx`): Monthly income input, monthly expenses (rent, car, other debts). Calculates DTI ratio with color-coded result (green <36%, yellow 36-43%, red >43%).

**Tax Estimator** (`src/components/tools/tax-estimator.tsx`): Annual gig earnings input, filing status select, estimated deductions. Calculates self-employment tax (15.3%) + estimated income tax. Shows quarterly payment amounts.

- [ ] **Step 2: Commit**

```bash
cd /Users/baralezrah/loan-portal
git add src/components/tools/
git commit -m "feat: add interactive tool components (calculator, estimator, comparison, DTI, tax)"
```

---

## Task 13: Homepage Redesign — GSAP ScrollTrigger

**Files:**
- Modify: `src/app/page.tsx` (complete rewrite)
- Create: `src/components/homepage/homepage.tsx`
- Create: `src/components/homepage/sections/hero.tsx`
- Create: `src/components/homepage/sections/problem.tsx`
- Create: `src/components/homepage/sections/how-it-works.tsx`
- Create: `src/components/homepage/sections/platform-showcase.tsx`
- Create: `src/components/homepage/sections/social-proof.tsx`
- Create: `src/components/homepage/sections/why-limecredit.tsx`
- Create: `src/components/homepage/sections/blog-preview.tsx`
- Create: `src/components/homepage/sections/faq.tsx`
- Create: `src/components/homepage/sections/final-cta.tsx`

The homepage is rebuilt as a GSAP ScrollTrigger pinned-scroll experience. Each pinned section is its own component. The homepage client component registers all ScrollTrigger instances on mount.

- [ ] **Step 1: Create homepage wrapper**

Replace `src/app/page.tsx` with:

```tsx
import { Homepage } from "@/components/homepage/homepage";
import { getPublishedArticles, getPublishedPlatformPages } from "@/actions/content";
import { JsonLd, organizationSchema, loanProductSchema } from "@/components/seo/json-ld";

export default async function Home() {
  const [{ articles }, platforms] = await Promise.all([
    getPublishedArticles(undefined, 1, 3),
    getPublishedPlatformPages(),
  ]);

  return (
    <>
      <JsonLd data={organizationSchema()} />
      <JsonLd data={loanProductSchema()} />
      <Homepage
        latestArticles={articles.map((a) => ({ title: a.title, slug: a.slug, excerpt: a.excerpt, featuredImage: a.featuredImage, publishedAt: a.publishedAt?.toISOString() || null, categoryName: a.category?.name || null }))}
        platforms={platforms.map((p) => ({ name: p.platformName, slug: p.slug }))}
      />
    </>
  );
}
```

- [ ] **Step 2: Create homepage client component with GSAP setup**

Create `src/components/homepage/homepage.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Hero } from "./sections/hero";
import { Problem } from "./sections/problem";
import { HowItWorks } from "./sections/how-it-works";
import { PlatformShowcase } from "./sections/platform-showcase";
import { SocialProof } from "./sections/social-proof";
import { WhyLimecredit } from "./sections/why-limecredit";
import { BlogPreview } from "./sections/blog-preview";
import { HomeFaq } from "./sections/faq";
import { FinalCta } from "./sections/final-cta";
import { Navbar } from "./navbar";
import { Footer } from "./footer";

gsap.registerPlugin(ScrollTrigger);

interface HomepageProps {
  latestArticles: { title: string; slug: string; excerpt: string | null; featuredImage: string | null; publishedAt: string | null; categoryName: string | null }[];
  platforms: { name: string; slug: string }[];
}

export function Homepage({ latestArticles, platforms }: HomepageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // ScrollTrigger instances are created inside each section component
      // This context ensures cleanup on unmount
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <>
      <Navbar />
      <div ref={containerRef}>
        <Hero />
        <Problem />
        <HowItWorks />
        <PlatformShowcase platforms={platforms} />
        <SocialProof />
        <WhyLimecredit />
        <BlogPreview articles={latestArticles} />
        <HomeFaq />
        <FinalCta />
      </div>
      <Footer />
    </>
  );
}
```

- [ ] **Step 3: Create section components**

The implementing agent should create each section component in `src/components/homepage/sections/`. Each pinned section follows this GSAP pattern:

```tsx
"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function SectionName() {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current || !contentRef.current) return;

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "top top",
        end: "+=100%",
        pin: true,
        scrub: 1,
      },
    });

    // Add animations to timeline
    tl.from(contentRef.current, { opacity: 0, y: 50 });

    return () => { tl.kill(); };
  }, []);

  return (
    <section ref={sectionRef} className="h-screen flex items-center justify-center">
      <div ref={contentRef}>
        {/* Section content */}
      </div>
    </section>
  );
}
```

**Section specifications from the design spec:**

1. **Hero** (pinned): Full viewport, "Get funded. Keep moving.", CTA buttons, illustration of gig worker on bike. Stroke draw animation on scroll.
2. **Problem** (pinned): Split layout, "Banks don't get gig work", stats about 73% denied. Text slides left, illustration right.
3. **HowItWorks** (pinned, longest): 3 steps cycle on scroll. Progress indicator 1/3 → 2/3 → 3/3. Each step has illustration + text.
4. **PlatformShowcase** (pinned): Grid of platform icons, pop in one by one with wobble. Links to platform pages.
5. **SocialProof** (pinned): Counter animation for stats ($2M+, 1200+, 4.8 stars).
6. **WhyLimecredit** (NOT pinned): 3-column differentiators, fade-in on intersection.
7. **BlogPreview** (NOT pinned): 3 latest article cards.
8. **HomeFaq** (NOT pinned): Accordion FAQ with schema.
9. **FinalCta** (pinned): Full viewport, "Ready to get funded?", converging elements.

Non-pinned sections use simple `ScrollTrigger` with `scrub: false` for entrance animations.

All sections use hand-drawn illustration images from `/public/illustrations/` (placeholder paths until Task 14 generates them). Use `<Image>` from `next/image` for illustrations.

Color palette: sage greens (#15803d, #f0f5f0), cream (#f8faf8), charcoal (#1a1a1a), consistent with Sage & Stone design.

- [ ] **Step 4: Remove Framer Motion from homepage**

The old `src/app/page.tsx` uses `framer-motion` extensively. The new homepage uses GSAP instead. After the rewrite, check if framer-motion is still used elsewhere. If not, it can be removed from package.json. If it's still used by other components (e.g. the apply page), leave it.

- [ ] **Step 5: Commit**

```bash
cd /Users/baralezrah/loan-portal
git add src/app/page.tsx src/components/homepage/
git commit -m "feat: redesign homepage with GSAP ScrollTrigger pinned sections"
```

---

## Task 14: Illustration Generation Script

**Files:**
- Create: `scripts/generate-illustrations.ts`

- [ ] **Step 1: Create illustration generation script**

Create `scripts/generate-illustrations.ts`:

```typescript
import { GoogleGenAI } from "@google/generative-ai";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("Set GEMINI_API_KEY environment variable");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const OUTPUT_DIR = join(process.cwd(), "public", "illustrations");

const STYLE_PREFIX = "Hand-drawn organic illustration, warm sketchy line art with imperfect strokes, sage green and warm cream color palette, soft charcoal outlines, approachable and human feel, white background, no text, no watermark";

const illustrations = [
  // Homepage
  { name: "hero-gig-worker", prompt: "A delivery rider on a bicycle with a phone, wearing a backpack, moving fast, energetic and optimistic mood" },
  { name: "problem-bank-door", prompt: "A closed ornate bank door with a small gig worker figure standing outside looking up at it, feeling excluded" },
  { name: "step-1-apply", prompt: "A person sitting casually filling out a form on their smartphone, relaxed and easy" },
  { name: "step-2-approved", prompt: "Bank statement documents with a large friendly green checkmark overlaid, simple and clean" },
  { name: "step-3-funded", prompt: "Money bills flowing into a smartphone screen, celebratory feeling, sparkles around it" },
  { name: "platform-icons", prompt: "A grid of small icons representing gig work: car, bicycle, shopping bag, laptop, wrench, camera, food delivery bag, all in sketchy style" },
  { name: "social-proof-stars", prompt: "Stars and sparkle elements scattered around, celebratory, achievement feeling, decorative" },
  { name: "faq-questions", prompt: "Floating question mark bubbles in various sizes, curious and friendly mood" },
  { name: "final-cta-arrow", prompt: "A large hand-drawn arrow pointing to the right, bold and inviting, with small decorative elements around it" },
  // Platform pages (generic gig work themes)
  { name: "platform-rideshare", prompt: "A friendly driver in a car waving, rideshare driving scene, urban background sketch" },
  { name: "platform-delivery", prompt: "A delivery person carrying a food bag on a bicycle, urban scene, motion lines" },
  { name: "platform-shopping", prompt: "A person pushing a shopping cart in a grocery store, checking their phone, personal shopper" },
  { name: "platform-freelance", prompt: "A person working on a laptop at a coffee shop, creative freelancer, comfortable and focused" },
  { name: "platform-handyman", prompt: "A person with tools fixing something, handyman or task worker, practical and skilled" },
  // Tools
  { name: "tool-calculator", prompt: "A calculator with coins and dollar signs around it, financial planning theme" },
  { name: "tool-chart", prompt: "A simple bar chart going upward with a dollar sign, income growth theme" },
  { name: "tool-compare", prompt: "Two columns side by side with checkmarks and crosses, comparison theme" },
  { name: "tool-balance", prompt: "A balance scale with money on one side and bills on the other, debt to income theme" },
  { name: "tool-tax", prompt: "Tax forms with a calculator and calendar, quarterly tax theme, organized" },
  // Blog
  { name: "blog-header", prompt: "An open book with lightbulb above it, knowledge and learning theme, guides and resources" },
];

async function generateIllustration(name: string, prompt: string) {
  console.log(`Generating: ${name}...`);
  try {
    const response = await genAI.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: `${STYLE_PREFIX}. ${prompt}`,
      config: { numberOfImages: 1 },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      const imageData = response.generatedImages[0].image;
      if (imageData?.imageBytes) {
        const buffer = Buffer.from(imageData.imageBytes, "base64");
        const filePath = join(OUTPUT_DIR, `${name}.png`);
        await writeFile(filePath, buffer);
        console.log(`  Saved: ${filePath}`);
        return true;
      }
    }
    console.log(`  Warning: No image generated for ${name}`);
    return false;
  } catch (error) {
    console.error(`  Error generating ${name}:`, error);
    return false;
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`Generating ${illustrations.length} illustrations...\n`);

  let success = 0;
  for (const ill of illustrations) {
    const ok = await generateIllustration(ill.name, ill.prompt);
    if (ok) success++;
    // Rate limiting — wait between requests
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\nDone: ${success}/${illustrations.length} illustrations generated.`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main();
```

- [ ] **Step 2: Run the script**

```bash
cd /Users/baralezrah/loan-portal
GEMINI_API_KEY=<key_from_memory> npx tsx scripts/generate-illustrations.ts
```

- [ ] **Step 3: Commit illustrations**

```bash
cd /Users/baralezrah/loan-portal
git add scripts/generate-illustrations.ts public/illustrations/
git commit -m "feat: add Gemini illustration generation script and generated assets"
```

---

## Task 15: Content Seed Script

**Files:**
- Create: `scripts/seed-content.ts`

This is the largest task. It creates a script that seeds all ~109 pages of content into the database: 5 categories, ~20 tags, ~35 articles, 14 platform pages, 50 state pages, 5 tool pages, and 5 comparison pages.

- [ ] **Step 1: Create the seed script**

Create `scripts/seed-content.ts`. The script should:

1. Import Prisma client from `@/lib/db`
2. Clear existing content tables (in correct order to respect foreign keys)
3. Seed categories: Guides, Platform Tips, Loan Education, News, Tax & Finance
4. Seed tags: ~20 relevant tags (1099, gig-work, uber, lyft, doordash, loans, credit, etc.)
5. Seed 35 articles with full HTML body content (2000-4000 words each), proper SEO meta, category assignment, tag assignment
6. Seed 14 platform pages with platform-specific data, FAQ entries, income stats
7. Seed 50 state pages with state-specific regulations, local stats, FAQ entries
8. Seed 5 tool pages pointing to the correct tool component identifiers
9. Seed 5 comparison pages with full comparison grids and verdicts
10. All content should be `published: true` with `publishedAt: new Date()`

The article content should be SEO-optimized, targeting keywords from the market report (1099 loans, gig worker loans, self-employed loans, bank statement loans, etc.). Each article should have unique, substantive content — not placeholder text.

The implementing agent should generate all content inline in the seed script. For the 50 state pages, use a data array of all US states with state codes and generate per-state content programmatically using template strings with state-specific variations.

- [ ] **Step 2: Run the seed script**

```bash
cd /Users/baralezrah/loan-portal
npx tsx scripts/seed-content.ts
```

- [ ] **Step 3: Verify content was seeded**

```bash
cd /Users/baralezrah/loan-portal
node -e "
const { PrismaClient } = require('./src/generated/prisma/client');
const p = new PrismaClient();
Promise.all([
  p.category.count(),
  p.tag.count(),
  p.article.count(),
  p.platformPage.count(),
  p.statePage.count(),
  p.toolPage.count(),
  p.comparisonPage.count(),
]).then(([c,t,a,p2,s,tp,cp]) => console.log({categories:c,tags:t,articles:a,platforms:p2,states:s,tools:tp,comparisons:cp}))
"
```

Expected: `{ categories: 5, tags: ~20, articles: ~35, platforms: 14, states: 50, tools: 5, comparisons: 5 }`

- [ ] **Step 4: Commit**

```bash
cd /Users/baralezrah/loan-portal
git add scripts/seed-content.ts
git commit -m "feat: add content seed script with ~109 pages of SEO content"
```

---

## Task 16: Final Integration & Verification

**Files:**
- Various verification and fixes

- [ ] **Step 1: Start dev server and verify**

```bash
cd /Users/baralezrah/loan-portal
npm run dev
```

- [ ] **Step 2: Verify public pages render**

Check these URLs in the browser:
- `http://localhost:3000` — Homepage with GSAP scroll
- `http://localhost:3000/blog` — Blog index with articles
- `http://localhost:3000/blog/best-loans-for-gig-workers` — Article detail
- `http://localhost:3000/loans-for-uber-drivers` — Platform page
- `http://localhost:3000/1099-loans-california` — State page
- `http://localhost:3000/tools/loan-calculator` — Tool page
- `http://localhost:3000/compare/limecredit-vs-fundo` — Comparison page
- `http://localhost:3000/robots.txt` — Robots file
- `http://localhost:3000/sitemap.xml` — Dynamic sitemap

- [ ] **Step 3: Verify admin CMS**

Check these URLs (requires admin login):
- `http://localhost:3000/admin/content` — Content dashboard with counts
- `http://localhost:3000/admin/content/articles` — Article list
- `http://localhost:3000/admin/content/platforms` — Platform list
- `http://localhost:3000/admin/content/states` — State list
- `http://localhost:3000/admin/content/categories` — Categories & tags
- `http://localhost:3000/admin/content/images` — Image library

- [ ] **Step 4: Fix any build errors**

```bash
cd /Users/baralezrah/loan-portal
npm run build
```

Fix any TypeScript or build errors that surface.

- [ ] **Step 5: Final commit**

```bash
cd /Users/baralezrah/loan-portal
git add -A
git commit -m "fix: resolve build errors and finalize SEO content system"
```
