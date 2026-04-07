# Phase 4: Admin UI Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish all admin pages to settings-quality: tabbed editors for content, better tables with sorting, responsive sidebar, richer dashboard with recharts, and consistent card patterns everywhere.

**Architecture:** No new models or server actions. Pure frontend refactoring of existing admin pages to use the reusable UI components from Phase 1 (PageHeader, StatCard, TabBar, etc.) and apply consistent design patterns.

**Tech Stack:** Next.js 16, Tailwind 4, recharts (installed in Phase 1), existing components.

---

## Task 1: Responsive Sidebar

**Files:**
- Modify: `src/components/admin/sidebar.tsx`
- Modify: `src/app/admin/layout.tsx`

Auto-collapse sidebar below 1280px. Add resize listener.

- [ ] **Step 1:** In `src/components/admin/sidebar.tsx`, add a `useEffect` with `window.matchMedia('(max-width: 1280px)')` that sets collapsed=true on narrow screens and collapsed=false on wide.

- [ ] **Step 2:** In `src/app/admin/layout.tsx`, make the main margin responsive. Use a CSS approach: `ml-[220px]` by default but the sidebar itself transitions, so the main content should also transition. Add a `group` class pattern or use CSS that adapts.

- [ ] **Step 3:** Commit: `git commit -m "feat: auto-collapse sidebar on narrow screens (<1280px)"`

---

## Task 2: Tabbed Content Editors

Replace the long-scroll content editors with horizontal tabs. Apply to: article editor, landing page editor, platform/state/tool/comparison editors.

**Files:**
- Modify: `src/app/admin/content/articles/new/article-editor-client.tsx`
- Modify: `src/app/admin/content/landing-pages/new/landing-page-editor-client.tsx`
- Modify: `src/app/admin/content/platforms/new/platform-editor-client.tsx`
- Modify: `src/app/admin/content/states/new/state-editor-client.tsx`
- Modify: `src/app/admin/content/tools/new/tool-editor-client.tsx`
- Modify: `src/app/admin/content/comparisons/new/comparison-editor-client.tsx`

For each editor:

- [ ] **Step 1: Article editor** — Split into tabs: [Content] [SEO & Meta] [Publish]. Content tab: title input + Tiptap body + excerpt. SEO tab: meta title (with char count), meta description, featured image, slug, OG image. Publish tab: category, tags, published toggle, date picker. Use `TabBar` component. Keep the same save button at top.

- [ ] **Step 2: Landing page editor** — Split into tabs: [Hero] [Content] [Form Config] [SEO] [Publish]. Hero: badge, headlines, subtext, illustration. Content: trust items, trust stats, how-it-works, testimonials, FAQ, final CTA. Form: UTM, platforms, defaults, template slug. SEO: meta title, description. Publish: toggle, slug preview.

- [ ] **Step 3: Platform/State/Tool/Comparison editors** — Each gets 2-3 tabs as appropriate. Platform: [Content] [FAQ] [SEO]. State: [Content] [Stats & FAQ] [SEO]. Tool: [Content] [SEO]. Comparison: [Content] [Grid] [FAQ & SEO].

- [ ] **Step 4:** Commit: `git commit -m "feat: convert content editors to tabbed layout"`

---

## Task 3: Enhanced List Pages

Add consistent search, sorting, and better styling to all admin list pages.

**Files:**
- Modify: `src/app/admin/content/articles/articles-client.tsx`
- Modify: `src/app/admin/content/platforms/platforms-client.tsx`
- Modify: `src/app/admin/content/states/states-client.tsx`
- Modify: `src/app/admin/content/landing-pages/landing-pages-client.tsx`
- Modify: `src/app/admin/email/campaigns/campaigns-client.tsx`
- Modify: `src/app/admin/email/sequences/sequences-client.tsx`

For each list page:

- [ ] **Step 1:** Add a search input above the table (client-side filter by title/name)
- [ ] **Step 2:** Add status filter pills (All, Published, Draft — or campaign-specific: All, Draft, Scheduled, Sent)
- [ ] **Step 3:** Wrap table in `bg-white rounded-xl border border-[#e4e4e7]` if not already
- [ ] **Step 4:** Add hover state `hover:bg-[#f8f8f6]` on rows
- [ ] **Step 5:** Use `PageHeader` component for page title + action button
- [ ] **Step 6:** Commit: `git commit -m "feat: add search and filter to all admin list pages"`

---

## Task 4: Dashboard Upgrade with Recharts

**Files:**
- Modify: `src/app/admin/dashboard/dashboard-client.tsx`

- [ ] **Step 1:** Add a simple bar chart showing the conversion funnel using recharts `BarChart`:
```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
```

Chart data from `contactMetrics.byStage` — show bars for LEAD, CONTACTED, APPLICANT, APPROVED, FUNDED. Green fill #15803d.

- [ ] **Step 2:** Add a second card with a simple stat: abandoned rate = (abandoned / total leads) * 100. Show as a big number.

- [ ] **Step 3:** Clean up the layout: use consistent card styling (`bg-white rounded-xl p-6 border border-[#e4e4e7]`), add section headers, use StatCard for all top-row metrics.

- [ ] **Step 4:** Commit: `git commit -m "feat: add recharts funnel chart to admin dashboard"`

---

## Task 5: Consistent Card Patterns Across All Admin Pages

Apply settings-quality card design to pages that still use the old flat patterns.

**Files:**
- Modify: `src/app/admin/settings/settings-client.tsx` (already good — reference)
- Modify: `src/app/admin/applications/applications-client.tsx`
- Modify: `src/app/admin/payments/payments-client.tsx`
- Modify: `src/app/admin/audit/audit-client.tsx`

For each:
- [ ] **Step 1:** Add `PageHeader` component for title
- [ ] **Step 2:** Wrap tables in `bg-white rounded-xl border border-[#e4e4e7]`
- [ ] **Step 3:** Use 11px uppercase tracking headers, hover rows, consistent badge colors
- [ ] **Step 4:** Add search input if not present
- [ ] **Step 5:** Commit: `git commit -m "feat: apply consistent card patterns to applications, payments, audit pages"`

---

## Task 6: Final Build + Push

- [ ] **Step 1:** `npx tsc --noEmit`
- [ ] **Step 2:** `npm run build 2>&1 | tail -15`
- [ ] **Step 3:** Fix any errors
- [ ] **Step 4:** Final commit if needed
- [ ] **Step 5:** Do NOT push — I'll merge from main
