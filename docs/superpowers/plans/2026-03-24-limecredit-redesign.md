# LimeCredit Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand and redesign the entire loan portal from Elilons (emerald theme) to LimeCredit (Sage & Stone design system).

**Architecture:** Visual-only redesign. Replace CSS variables, fonts, and component styles in-place. No business logic changes. Work bottom-up: theme foundation → shared components → pages (simplest first, largest last).

**Tech Stack:** Next.js 16, Tailwind v4 (PostCSS), shadcn/ui, Framer Motion, Inter font, Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-24-limecredit-redesign.md`

---

## Chunk 1: Theme Foundation

### Task 1: Replace CSS variables and font setup

**Files:**
- Modify: `src/app/globals.css` (full rewrite of `:root` and removal of `.dark`)
- Modify: `src/app/layout.tsx:1-36` (font imports, metadata)

- [ ] **Step 1: Update globals.css `:root` block**

Replace the existing `:root` block (lines 50-83) with the Sage & Stone tokens:

```css
:root {
  --background: #f8faf8;
  --foreground: #1a1a1a;
  --card: #ffffff;
  --card-foreground: #1a1a1a;
  --popover: #ffffff;
  --popover-foreground: #1a1a1a;
  --primary: #1a1a1a;
  --primary-foreground: #ffffff;
  --secondary: #f0f5f0;
  --secondary-foreground: #1a1a1a;
  --muted: #f0f5f0;
  --muted-foreground: #71717a;
  --accent: #15803d;
  --accent-foreground: #ffffff;
  --destructive: #dc2626;
  --border: #f0f0f0;
  --input: #f0f0f0;
  --ring: #15803d;
  --chart-1: #15803d;
  --chart-2: #1a1a1a;
  --chart-3: #71717a;
  --chart-4: #b45309;
  --chart-5: #2563eb;
  --radius: 0.625rem;
  --sidebar: #ffffff;
  --sidebar-foreground: #1a1a1a;
  --sidebar-primary: #1a1a1a;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #f0f5f0;
  --sidebar-accent-foreground: #1a1a1a;
  --sidebar-border: #f0f0f0;
  --sidebar-ring: #15803d;

  /* Extended tokens */
  --surface-muted-dark: #e2ebe2;
  --foreground-subtle: #a1a1aa;
  --warning: #b45309;
  --warning-surface: #fef9ec;
  --info: #2563eb;
  --info-surface: #eef4ff;
  --destructive-surface: #fff1f2;
  --accent-surface: #f0f5f0;
}
```

- [ ] **Step 2: Remove the `.dark` block**

Delete the entire `.dark { ... }` block and the `@custom-variant dark (&:is(.dark *));` line near the top of the file.

- [ ] **Step 3: Add extended token color mappings to @theme**

Add to the `@theme inline` block:

```css
--color-surface-muted-dark: var(--surface-muted-dark);
--color-foreground-subtle: var(--foreground-subtle);
--color-warning: var(--warning);
--color-warning-surface: var(--warning-surface);
--color-info: var(--info);
--color-info-surface: var(--info-surface);
--color-destructive-surface: var(--destructive-surface);
--color-accent-surface: var(--accent-surface);
```

- [ ] **Step 4: Configure Sonner toast styling**

In `layout.tsx`, update the `<Toaster />` component with Sage & Stone styles:

```tsx
<Toaster
  toastOptions={{
    style: {
      background: '#ffffff',
      border: 'none',
      borderRadius: '10px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
      color: '#1a1a1a',
      fontSize: '14px',
    },
  }}
/>
```

- [ ] **Step 5: Update layout.tsx fonts and metadata**

Replace Geist imports with Inter:

```tsx
import { Inter, Geist_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
```

Update metadata:
```tsx
export const metadata: Metadata = {
  title: "LimeCredit",
  description: "Fast loans for gig workers. $100 to $10,000.",
};
```

Update the body className to use `inter.variable` instead of `geistSans.variable`.

- [ ] **Step 6: Verify the app loads**

Run: `cd /Users/baralezrah/loan-portal && npm run dev`
Expected: App starts without errors, background is warm off-white (#f8faf8), text is near-black, Inter font loads.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: replace theme with LimeCredit Sage & Stone design tokens"
```

---

### Task 2: Restyle shadcn/ui base components

**Files:**
- Modify: `src/components/ui/button.tsx` (60 lines)
- Modify: `src/components/ui/input.tsx` (20 lines)
- Modify: `src/components/ui/card.tsx` (103 lines)
- Modify: `src/components/ui/badge.tsx` (52 lines)
- Modify: `src/components/ui/table.tsx` (116 lines)
- Modify: `src/components/ui/dialog.tsx` (157 lines)
- Modify: `src/components/ui/tabs.tsx` (82 lines)
- Modify: `src/components/ui/select.tsx` (201 lines)
- Modify: `src/components/ui/textarea.tsx` (18 lines)
- Modify: `src/components/ui/label.tsx` (20 lines)
- Modify: `src/components/ui/separator.tsx` (25 lines)

- [ ] **Step 1: Restyle button.tsx**

Update variants:
- `default`: `bg-[#1a1a1a] text-white hover:bg-[#333] rounded-lg font-semibold text-sm` (black CTA)
- `destructive`: `bg-destructive text-white hover:bg-destructive/90 rounded-lg`
- `outline`: `border border-[#f0f0f0] bg-transparent text-[#71717a] hover:bg-[#f0f5f0] hover:text-[#1a1a1a] rounded-lg`
- `secondary`: `bg-[#f0f5f0] text-[#1a1a1a] hover:bg-[#e2ebe2] rounded-lg`
- `ghost`: `text-[#71717a] hover:bg-[#f0f5f0] hover:text-[#1a1a1a] rounded-lg`
- `link`: `text-[#71717a] hover:text-[#1a1a1a] underline-offset-4`
- Remove any `rounded-full` on buttons.

- [ ] **Step 2: Restyle input.tsx and textarea.tsx**

Input: `bg-white rounded-[10px] border-transparent px-4 py-3.5 text-[15px] placeholder:text-[#a1a1aa] focus:ring-2 focus:ring-[#15803d] focus:border-transparent`

Textarea: same base styles, add `min-h-[120px]`.

- [ ] **Step 3: Restyle card.tsx**

Remove any border/shadow classes. Set: `bg-white rounded-[10px] p-0` (padding handled by CardContent). CardHeader/CardContent/CardFooter keep structural padding but no borders or separators.

- [ ] **Step 4: Restyle badge.tsx**

Add status variants:
- `default`: `bg-[#f0f5f0] text-[#1a1a1a] rounded-full px-2.5 py-0.5 text-[11px] font-semibold`
- `approved`: `bg-[#f0f5f0] text-[#15803d]`
- `pending`: `bg-[#fef9ec] text-[#b45309]`
- `active`: `bg-[#eef4ff] text-[#2563eb]`
- `destructive`: `bg-[#fff1f2] text-[#dc2626]`

- [ ] **Step 5: Restyle table.tsx**

Remove row borders. Column headers: `text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold`. Rows: `py-2.5` padding, no border-bottom. Alternate row backgrounds optional (even rows `bg-[#f8faf8]`).

- [ ] **Step 6: Restyle dialog.tsx**

Overlay: `bg-black/40`. Content: `bg-white rounded-xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.08)]`. Remove any border.

- [ ] **Step 7: Restyle tabs.tsx**

Tab list: no border-bottom. Active tab: `bg-[#1a1a1a] text-white rounded-lg px-3 py-1.5 text-sm font-medium`. Inactive: `text-[#71717a] hover:text-[#1a1a1a]`.

- [ ] **Step 8: Restyle select.tsx**

Trigger: same as input styles. Content dropdown: `bg-white rounded-[10px] shadow-[0_8px_32px_rgba(0,0,0,0.08)]` no border. Item hover: `bg-[#f0f5f0]`.

- [ ] **Step 9: Restyle label.tsx**

Set: `text-xs font-semibold uppercase tracking-[0.05em] text-[#1a1a1a]` (micro-label style).

- [ ] **Step 10: Restyle separator.tsx**

Change from border-based to tonal: `bg-[#f0f0f0] h-px` instead of using border.

- [ ] **Step 11: Verify components render correctly**

Run: `npm run dev`, navigate to `/admin/login` and check that inputs, buttons, labels all show the new styles.

- [ ] **Step 12: Commit**

```bash
git add src/components/ui/
git commit -m "feat: restyle all shadcn/ui components for Sage & Stone"
```

---

## Chunk 2: Shared Components & Admin Layout

### Task 3: Restyle admin sidebar

**Files:**
- Modify: `src/components/admin-sidebar.tsx` (121 lines)
- Modify: `src/app/admin/layout.tsx` (23 lines)

- [ ] **Step 1: Update admin layout**

Change background from `#FAFAF7` to `bg-[#f8faf8]`. Ensure the flex layout is: sidebar `w-[200px] flex-shrink-0` + main `flex-1 p-6`.

- [ ] **Step 2: Restyle admin-sidebar.tsx**

- Sidebar container: `w-[200px] bg-white h-screen fixed` with no border-right (use tonal shift)
- Logo at top: `<span className="font-extrabold text-[15px] tracking-[-0.03em]">Lime<span className="text-[#15803d]">Credit</span></span>` with `px-3 pt-5 pb-4`
- Nav items: `rounded-lg px-3 py-2.5 text-[13px] font-medium`
- Active: `bg-[#f0f5f0] text-[#1a1a1a]`
- Inactive: `text-[#71717a] hover:bg-[#f0f5f0] hover:text-[#1a1a1a]`
- Sign out at bottom: `text-[#71717a] text-[13px]`
- Icons: 18px, match text color

- [ ] **Step 3: Verify admin layout**

Run: `npm run dev`, navigate to `/admin/dashboard`. Sidebar should be white on off-white background, logo shows LimeCredit with green "Credit".

- [ ] **Step 4: Commit**

```bash
git add src/components/admin-sidebar.tsx src/app/admin/layout.tsx
git commit -m "feat: restyle admin sidebar and layout for LimeCredit"
```

---

### Task 4: Restyle application-table component

**Files:**
- Modify: `src/components/application-table.tsx` (211 lines)

- [ ] **Step 1: Update status badge mappings**

Replace emerald/green color classes with token-based badge variants:
- PENDING → `bg-[#fef9ec] text-[#b45309]`
- APPROVED → `bg-[#f0f5f0] text-[#15803d]`
- ACTIVE → `bg-[#eef4ff] text-[#2563eb]`
- LATE / COLLECTIONS → `bg-[#fff1f2] text-[#dc2626]`
- DEFAULTED / REJECTED → `bg-[#fff1f2] text-[#dc2626]`
- PAID_OFF → `bg-[#f0f5f0] text-[#15803d]`

- [ ] **Step 2: Update table styling**

- Remove any `border` or `divide-y` classes
- Column headers: `text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold`
- Row hover: `hover:bg-[#f0f5f0]`
- Remove alternating stripes if they use emerald tones

- [ ] **Step 3: Verify**

Check `/admin/dashboard` — the applications table should show clean typography with correct status badges.

- [ ] **Step 4: Commit**

```bash
git add src/components/application-table.tsx
git commit -m "feat: restyle application table with Sage & Stone status badges"
```

---

### Task 5: Restyle status-display and status-checker components

**Files:**
- Modify: `src/components/status-display.tsx` (180 lines)
- Modify: `src/components/status-checker.tsx` (98 lines)

- [ ] **Step 1: Update status-checker.tsx**

- Input: white bg, 10px radius, no visible border
- Button: black bg, white text, 8px radius
- Container: centered, max-w-md
- Heading: `text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]`
- Replace any emerald color classes

- [ ] **Step 2: Update status-display.tsx**

- Replace all emerald/green status colors with the badge token colors
- Dollar amounts: `text-[#15803d] font-extrabold` (sage green for money)
- Status badge: use the standard badge variants
- Payment table: micro-label column headers, no borders
- Info boxes: `bg-[#f0f5f0] rounded-[10px] p-4`

- [ ] **Step 3: Verify**

Navigate to `/status` and test with a sample code if available.

- [ ] **Step 4: Commit**

```bash
git add src/components/status-display.tsx src/components/status-checker.tsx
git commit -m "feat: restyle status components for Sage & Stone"
```

---

### Task 6: Restyle document-viewer component

**Files:**
- Modify: `src/components/document-viewer.tsx` (79 lines)

- [ ] **Step 1: Update styles**

- Container: `bg-white rounded-[10px]` no border
- Image/document frame: `bg-[#f0f5f0] rounded-lg`
- Buttons: black primary style
- Replace any emerald color references

- [ ] **Step 2: Commit**

```bash
git add src/components/document-viewer.tsx
git commit -m "feat: restyle document viewer for Sage & Stone"
```

---

## Chunk 3: Admin Pages

### Task 7: Restyle admin login page

**Files:**
- Modify: `src/app/admin/login/page.tsx` (123 lines)

- [ ] **Step 1: Update login page**

- Page background: `bg-[#f8faf8] min-h-screen flex items-center justify-center`
- Card: `bg-white rounded-xl p-8 w-full max-w-sm` no border, no shadow
- Logo: LimeCredit wordmark centered at top
- Inputs: white bg, 10px radius, micro-label above each
- Button: full-width black CTA, `rounded-lg py-3.5 font-semibold text-sm`
- Error messages: `text-[13px] text-destructive`
- Replace any emerald color references

- [ ] **Step 2: Verify**

Navigate to `/admin/login`. Clean centered card on off-white background.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/login/page.tsx
git commit -m "feat: restyle admin login page for LimeCredit"
```

---

### Task 8: Restyle admin dashboard

**Files:**
- Modify: `src/app/admin/dashboard/dashboard-client.tsx` (230 lines)

- [ ] **Step 1: Consolidate stat cards to 4**

The current dashboard shows 8+ status-count cards. Consolidate to exactly 4 stat cards per the spec:
- **Active Loans** (count) — `text-[#1a1a1a]`
- **Outstanding** (total dollar amount) — `text-[#1a1a1a]`
- **Pending** (count) — `text-[#b45309]` (warning)
- **Default Rate** (percentage) — `text-[#15803d]` (positive = low rate)

Card styling:
- Container: `bg-white rounded-[10px] p-4` no border, no shadow
- Stat label: `text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold`
- Stat value: `text-[22px] font-extrabold tracking-[-0.02em]`

Remove the per-status count breakdown (APPROVED, REJECTED, LATE, etc.) — that detail moves to the `/admin/applications` page filter tabs.

- [ ] **Step 2: Update page title**

`text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]` — "Dashboard"

- [ ] **Step 3: Replace all emerald color classes**

Search for `emerald`, `green-` and replace with Sage & Stone equivalents throughout the file.

- [ ] **Step 4: Update "Recent Applications" section**

Keep only 5 rows max. Add a "View all →" link (`text-[#71717a] hover:text-[#1a1a1a] text-sm`) that links to `/admin/applications`.

- [ ] **Step 5: Verify**

Navigate to `/admin/dashboard`. Stat cards on off-white background, correct typography.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/dashboard/dashboard-client.tsx
git commit -m "feat: restyle admin dashboard for Sage & Stone"
```

---

### Task 9: Create /admin/applications list route

**Note:** `src/app/admin/applications/[id]/` already exists (detail page). The new `page.tsx` and `applications-client.tsx` are siblings to that `[id]/` directory — this is standard Next.js routing.

**Files:**
- Create: `src/app/admin/applications/page.tsx`
- Create: `src/app/admin/applications/applications-client.tsx`
- Modify: `src/app/admin/dashboard/dashboard-client.tsx` (extract table logic)

- [ ] **Step 1: Create applications page wrapper**

```tsx
// src/app/admin/applications/page.tsx
import { ApplicationsClient } from "./applications-client";

export default function ApplicationsPage() {
  return <ApplicationsClient />;
}
```

- [ ] **Step 2: Create applications-client.tsx**

Move the full applications table with filter tabs from `dashboard-client.tsx` into this new file. Include:
- Page title: "Applications" (H2 style)
- Filter tabs: All, Pending, Approved, Active, Late, Collections, Defaulted, Paid Off (use restyled Tabs component)
- Search input at top-right
- Full ApplicationTable component
- Style tabs: active = black pill, inactive = gray text

- [ ] **Step 3: Update dashboard to show preview only**

In `dashboard-client.tsx`, replace the full table with a "Recent Applications" card showing 5 rows max + "View all →" link.

- [ ] **Step 4: Update admin-sidebar.tsx**

Ensure "Applications" nav link points to `/admin/applications`.

- [ ] **Step 5: Verify**

Navigate to both `/admin/dashboard` (preview table) and `/admin/applications` (full table with filters).

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/applications/page.tsx src/app/admin/applications/applications-client.tsx src/app/admin/dashboard/dashboard-client.tsx src/components/admin-sidebar.tsx
git commit -m "feat: extract applications list into dedicated admin route"
```

---

### Task 10: Restyle application detail page

**Files:**
- Modify: `src/app/admin/applications/[id]/detail-client.tsx` (875 lines)

- [ ] **Step 1: Update section structure**

This is the largest admin file. Update systematically:
- Page title: applicant name, `text-[22px] font-extrabold tracking-[-0.03em]`
- Section headings: `text-[16px] font-bold tracking-[-0.02em] text-[#1a1a1a]`
- Section containers: `bg-white rounded-[10px] p-6` no borders

- [ ] **Step 2: Update risk score card**

- Container: `bg-white rounded-[10px] p-6`
- Score value: large, `text-[#15803d]` if good, `text-[#b45309]` if medium, `text-[#dc2626]` if poor
- Label: micro-label style

- [ ] **Step 3: Update action buttons**

- Approve: `bg-[#1a1a1a] text-white rounded-lg px-6 py-2.5 font-semibold text-sm`
- Reject: `border border-[#dc2626] text-[#dc2626] bg-transparent rounded-lg px-6 py-2.5 font-semibold text-sm`
- Fund: same as Approve
- Disabled state: `opacity-50 pointer-events-none`

- [ ] **Step 4: Update all status badges and money values**

- Dollar amounts: `text-[#15803d]`
- Status badges: use token-based variants
- Replace all emerald/green references

- [ ] **Step 5: Update payment schedule table**

- Micro-label headers
- No borders, use whitespace
- Paid amounts in green, due amounts in neutral

- [ ] **Step 6: Verify**

Navigate to an application detail page. Check all sections render with correct styling.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/applications/[id]/detail-client.tsx
git commit -m "feat: restyle application detail page for Sage & Stone"
```

---

### Task 11: Restyle payments, audit, and settings pages

**Files:**
- Modify: `src/app/admin/payments/payments-client.tsx` (116 lines)
- Modify: `src/app/admin/audit/audit-client.tsx` (109 lines)
- Modify: `src/app/admin/settings/settings-client.tsx` (178 lines)

- [ ] **Step 1: Restyle payments-client.tsx**

- Page title: H2 style
- Filter tabs: black active pill style
- Payment table: micro-label headers, token-based status badges
- Action buttons (retry, settle): black primary or ghost style
- Replace all emerald references

- [ ] **Step 2: Restyle audit-client.tsx**

- Page title: H2 style
- Filter dropdown: restyled select
- Event list: `bg-white rounded-[10px]` cards or clean list with whitespace separation
- Timestamps: `text-[13px] text-[#a1a1aa]`
- Action labels: micro-label style
- Replace all emerald references

- [ ] **Step 3: Restyle settings-client.tsx**

- Page title: H2 style
- Settings groups: `bg-white rounded-[10px] p-6` cards
- Labels: micro-label style
- Inputs: standard restyled inputs
- Save buttons: black primary style
- Info panels (risk model): `bg-[#f0f5f0] rounded-[10px] p-4`
- Replace all emerald references

- [ ] **Step 4: Verify all three pages**

Navigate to each page and confirm styling is consistent.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/payments/payments-client.tsx src/app/admin/audit/audit-client.tsx src/app/admin/settings/settings-client.tsx
git commit -m "feat: restyle payments, audit, and settings pages for Sage & Stone"
```

---

## Chunk 4: Public Pages

### Task 12: Restyle landing page

**Files:**
- Modify: `src/app/page.tsx` (1019 lines)

This is the second-largest file. Work section by section.

- [ ] **Step 1: Update navbar**

- Fixed top, `bg-[rgba(248,250,248,0.8)] backdrop-blur-xl z-50`
- Logo: `<span className="font-extrabold text-lg tracking-[-0.03em]">Lime<span className="text-[#15803d]">Credit</span></span>`
- Nav links: `text-[13px] font-medium text-[#71717a] hover:text-[#1a1a1a]`
- CTA: `bg-[#1a1a1a] text-white px-5 py-2 rounded-lg text-[13px] font-semibold`
- Remove any emerald/cream background colors (`#FAFAF7`, emerald-900, etc.)

- [ ] **Step 2: Update hero section**

- Badge: `bg-[#f0f5f0] text-[#15803d] text-xs font-semibold px-3.5 py-1.5 rounded-full`
- Headline: `text-[48px] font-extrabold tracking-[-0.035em] leading-[1.05] text-[#1a1a1a]` — change text to "Get funded. Keep moving."
- Subtext: `text-base text-[#71717a] leading-relaxed`
- Primary CTA: `bg-[#1a1a1a] text-white px-7 py-3.5 rounded-lg text-sm font-semibold`
- Secondary link: `text-[#71717a] text-sm font-medium hover:text-[#1a1a1a]` — "Check loan status →"
- Remove any emerald gradient backgrounds

- [ ] **Step 3: Update trust bar**

- 3 cards in a row: `bg-[#f0f5f0]` with sage tonal gradient (left: `#f0f5f0`, middle: `#eaf0ea`, right: `#e2ebe2`)
- Stat number: `text-2xl font-extrabold tracking-[-0.02em] text-[#1a1a1a]`
- Stat label: `text-xs text-[#71717a]`
- Container: `rounded-xl overflow-hidden`

- [ ] **Step 4: Update "How it works" section**

- Section heading: H1 style
- Step numbers/icons: `bg-[#f0f5f0] text-[#15803d]` circles
- Step titles: `text-base font-bold text-[#1a1a1a]`
- Step descriptions: `text-sm text-[#71717a]`

- [ ] **Step 5: Update social proof toast**

- Toast container: `bg-white rounded-[10px] shadow-[0_8px_32px_rgba(0,0,0,0.08)] p-4`
- Replace any emerald colors in the toast

- [ ] **Step 6: Update footer**

- Background: `bg-[#1a1a1a]` (dark footer for premium contrast)
- Links: `text-[13px] text-[#a1a1aa] hover:text-white`
- Logo: LimeCredit wordmark in white with `text-[#15803d]` for "Credit"
- Copyright: `text-[12px] text-[#71717a]`

- [ ] **Step 7: Replace ALL remaining emerald/green Tailwind classes**

Search for: `emerald`, `green-`, `#FAFAF7`, and replace with Sage & Stone equivalents.

- [ ] **Step 8: Update Framer Motion values**

Keep existing animation structure but ensure any color-interpolated animations use the new palette. Verify scroll parallax still works.

- [ ] **Step 9: Verify**

Navigate to `/`. Full landing page should render with Sage & Stone styling, all animations working.

- [ ] **Step 10: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: restyle landing page for LimeCredit Sage & Stone"
```

---

### Task 13: Restyle application flow

**Files:**
- Modify: `src/app/(public)/apply/page.tsx` (1715 lines)

This is the largest file. The multi-step form is entirely self-contained here.

- [ ] **Step 1: Update the nav and progress bar**

- Nav: logo left (`LimeCredit` wordmark), step counter right: `text-[13px] text-[#71717a]`
- Progress bar: `h-[3px] bg-[#e5e7eb]` track, `bg-[#1a1a1a]` fill (black, not green)

- [ ] **Step 2: Update form container**

- Centered: `max-w-[400px] mx-auto`
- Step headline: `text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]`
- Step subtitle: `text-sm text-[#71717a]`

- [ ] **Step 3: Update Step 1 (loan amount)**

- Amount display: `text-[32px] font-extrabold text-[#15803d]` (green for money)
- Slider track: `bg-[#e5e7eb]`, fill: `bg-[#1a1a1a]`, thumb: `bg-[#1a1a1a]` with white border
- Range labels: `text-[11px] text-[#a1a1aa]`
- Term pills: selected `bg-[#1a1a1a] text-white`, unselected `bg-[#f0f5f0] text-[#71717a]`
- Monthly estimate: `bg-[#f0f5f0] rounded-[10px] p-4`
- Continue: full-width black CTA

- [ ] **Step 4: Update Step 2 (personal info)**

- Labels: micro-label style (uppercase, 12px, semibold)
- Inputs: white bg, 10px radius
- Continue: full-width black CTA

- [ ] **Step 5: Update Step 3 (platform selection)**

- Platform pills: `bg-[#f0f5f0] rounded-lg px-4 py-3 text-sm` unselected
- Selected: `bg-[#1a1a1a] text-white rounded-lg`
- Replace any emerald outlines/rings

- [ ] **Step 6: Update Step 4 (SSN)**

- Security message: `bg-[#f0f5f0] rounded-[10px] p-4` with lock icon in `text-[#15803d]`
- Input: standard restyled input

- [ ] **Step 7: Update Step 5 (Plaid) and Step 6 (documents)**

- Plaid button: black CTA style
- Upload zone: `border-2 border-dashed border-[#e5e7eb] rounded-[10px] p-8 hover:border-[#15803d]`
- File list items: `bg-[#f0f5f0] rounded-lg p-3`

- [ ] **Step 8: Update Step 7 (review & submit)**

- Review sections: `bg-[#f0f5f0] rounded-[10px] p-4`
- Edit links: `text-[#71717a] text-sm hover:text-[#1a1a1a]`
- Submit button: full-width black CTA, `font-semibold`

- [ ] **Step 9: Replace ALL remaining emerald/green Tailwind classes**

Search the entire file for: `emerald`, `green-`, and replace systematically.

- [ ] **Step 10: Verify all 7 steps**

Navigate to `/apply` and step through each form step. Check styling, animations, and transitions.

- [ ] **Step 11: Commit**

```bash
git add src/app/(public)/apply/page.tsx
git commit -m "feat: restyle 7-step application flow for LimeCredit Sage & Stone"
```

---

### Task 14: Restyle status pages and legal pages

**Files:**
- Modify: `src/app/(public)/status/page.tsx` (17 lines)
- Modify: `src/app/(public)/status/[code]/page.tsx` (49 lines)
- Modify: `src/app/(public)/terms/page.tsx` (28 lines)
- Modify: `src/app/(public)/privacy/page.tsx` (28 lines)
- Modify: `src/app/(public)/disclosures/page.tsx` (30 lines)

- [ ] **Step 1: Update status pages**

- `/status`: heading in H1 style, input and button use restyled components
- `/status/[code]`: uses StatusDisplay component (already restyled in Task 5)
- Replace any emerald references

- [ ] **Step 2: Update legal pages**

- Container: `max-w-[680px] mx-auto py-16 px-6`
- H1: `text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]`
- H2: `text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10`
- Body: `text-[15px] text-[#71717a] leading-relaxed`
- Links: `text-[#15803d] hover:underline`
- Replace any emerald/brand references

- [ ] **Step 3: Update page titles/metadata**

Replace "Elilons" or "1099 Loan Portal" with "LimeCredit" in any page-level metadata.

- [ ] **Step 4: Verify**

Check all 5 pages render correctly with the new styles.

- [ ] **Step 5: Commit**

```bash
git add src/app/(public)/
git commit -m "feat: restyle status and legal pages for LimeCredit"
```

---

## Chunk 5: Final Sweep

### Task 15: Global search-and-replace for remaining brand references

**Files:**
- All files in `src/`

- [ ] **Step 1: Search for old brand references**

Search the entire `src/` directory for:
- `Elilons` (case-insensitive)
- `1099 Loan Portal`
- `emerald` (Tailwind classes)
- `green-` (Tailwind classes, but be careful not to replace CSS variable references)
- `#FAFAF7` (old cream color)
- `rounded-full` on buttons (should be `rounded-lg`)

- [ ] **Step 2: Replace any remaining instances**

Replace with LimeCredit equivalents. For any `emerald-` or `green-` Tailwind classes that remain, replace with the nearest Sage & Stone token.

- [ ] **Step 3: Update Plaid client_name**

In `src/app/api/plaid/create-link-token/route.ts`, change `client_name: "1099 Loan Portal"` to `client_name: "LimeCredit"`. This is user-visible in the Plaid Link modal during bank linking.

- [ ] **Step 4: Update all 11 email templates**

All files in `src/lib/emails/` contain "1099 Loan Portal" in footers and subject lines. Replace with "LimeCredit" in every template. Update any emerald color references in email inline styles to use Sage & Stone colors (#15803d for accents, #1a1a1a for primary, #f8faf8 for backgrounds).

- [ ] **Step 5: Verify the full app**

Run `npm run dev` and navigate through:
- Landing page → Apply flow (all 7 steps) → Status check
- Admin login → Dashboard → Applications → Application detail → Payments → Audit → Settings

Everything should be cohesive Sage & Stone styling with no emerald remnants.

- [ ] **Step 6: Run build**

```bash
cd /Users/baralezrah/loan-portal && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: complete LimeCredit Sage & Stone redesign — final sweep"
```
