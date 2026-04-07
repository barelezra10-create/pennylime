# LimeCredit — Full Redesign Spec

## Overview

Redesign the loan portal under the new brand **LimeCredit** with the **Sage & Stone** design system. This is a full redesign covering all public-facing pages (landing, application flow, status checker, legal pages) and the admin panel (dashboard, applications, payments, audit log, settings).

The redesign replaces the current Elilons branding and emerald/green aesthetic with a restrained, premium fintech identity. LimeCredit is a standalone brand, not affiliated with Coastal Debt.

## Brand Identity

- **Name:** LimeCredit
- **Logo treatment:** "Lime" in near-black (#1a1a1a), "Credit" in sage green (#15803d). Text-only wordmark, no icon.
- **Positioning:** Premium lending for gig workers. Trustworthy, clean, modern.
- **Tone:** Confident and direct. Not corporate, not casual. Think "your smart friend who works in finance."

## Design System: Sage & Stone

### Colors

| Token | Hex | Usage |
|---|---|---|
| `background` | #f8faf8 | Page background, warm off-white |
| `surface` | #ffffff | Cards, inputs, sidebar |
| `surface-muted` | #f0f5f0 | Info boxes, inactive pills, badges, hover states |
| `surface-muted-dark` | #e2ebe2 | Stronger emphasis surfaces |
| `foreground` | #1a1a1a | Primary text, headlines, CTAs |
| `foreground-muted` | #71717a | Secondary text, descriptions |
| `foreground-subtle` | #a1a1aa | Micro-labels, placeholders |
| `accent` | #15803d | Money values, positive indicators, "Credit" in logo |
| `accent-surface` | #f0f5f0 | Accent backgrounds (badges, info boxes) |
| `destructive` | #dc2626 | Errors, rejected status, late payments |
| `destructive-surface` | #fff1f2 | Destructive badge backgrounds |
| `warning` | #b45309 | Pending status, caution |
| `warning-surface` | #fef9ec | Warning badge backgrounds |
| `info` | #2563eb | Active status, informational |
| `info-surface` | #eef4ff | Info badge backgrounds |

### Color Rules

1. **Green is for money and positive outcomes only.** Never use green for CTAs, navigation, or decorative elements. Green means: dollar amounts, approved status, positive rates, the word "Credit" in the logo.
2. **Black for all CTAs.** Primary buttons are #1a1a1a with white text. This creates premium contrast and keeps green reserved.
3. **No colored borders.** Hierarchy is achieved through tonal surface shifts (white card on #f8faf8 background). If a border is absolutely needed, use #f0f0f0 at most.

### Typography

- **Font family:** Premium grotesque sans-serif. Primary: `General Sans` or `Satoshi` (Google Fonts fallback: `Inter`). Monospace: `Geist Mono` for application codes.
- **Headline weight:** 800 (extra-bold)
- **Headline tracking:** -0.03em (tight)
- **Body weight:** 400–500
- **Body tracking:** normal

| Scale | Size | Weight | Tracking | Usage |
|---|---|---|---|---|
| Display | 48px | 800 | -0.035em | Landing hero |
| Heading 1 | 28px | 800 | -0.03em | Form step titles |
| Heading 2 | 22px | 800 | -0.03em | Page titles (admin) |
| Heading 3 | 16px | 700 | -0.02em | Card/section titles |
| Body | 14–16px | 400 | normal | Paragraphs, descriptions |
| Label | 13px | 500 | normal | Form labels, nav items |
| Micro | 11–12px | 600 | 0.05em | Uppercase category labels, badge text |

### Spacing & Radius

- **Border radius base:** 10px
  - Inputs, cards: 10px
  - Buttons: 8–10px
  - Badges/pills: 100px (full round)
  - Large containers: 12px
- **Spacing scale:** Tailwind default (4px base). Key patterns:
  - Input padding: `px-4 py-3.5`
  - Card padding: `p-4` to `p-6`
  - Section gaps: `gap-6` to `gap-10`
  - Page padding: `p-6` (admin), `px-8` (public)

### Elevation

- **No traditional shadows.** Hierarchy comes from tonal layering (white on off-white).
- **Exception:** Floating elements (modals, dropdowns) use a subtle shadow: `0 8px 32px rgba(0,0,0,0.08)`
- **Navbar:** Frosted glass — `rgba(248,250,248,0.8)` with `backdrop-filter: blur(12px)`

### Components

#### Buttons
- **Primary:** bg #1a1a1a, text white, radius 8–10px, font-weight 600, font-size 14px. Hover: bg #333.
- **Secondary:** bg transparent, text #71717a, font-weight 500. Hover: bg #f0f5f0.
- **Text link:** color #71717a, append " →" for navigation links. Hover: color #1a1a1a.

#### Inputs
- **Background:** white
- **Border:** none visible (or 1px #f0f0f0 if needed for accessibility)
- **Radius:** 10px
- **Padding:** 14px 16px
- **Focus state:** 2px ring in #15803d (sage green)
- **Placeholder:** color #a1a1aa
- **Label:** uppercase micro style (12px, weight 600, tracking 0.05em, color #1a1a1a)

#### Status Badges
- Pill-shaped (border-radius 100px), padding 2px 8px, font-size 11px, weight 600
- Approved/Paid Off: bg `accent-surface`, text `accent`
- Pending: bg `warning-surface`, text `warning`
- Active: bg `info-surface`, text `info`
- Late/Collections: bg `destructive-surface`, text `destructive`
- Rejected/Defaulted: bg `destructive-surface`, text `destructive`

#### Cards
- White background on #f8faf8 page
- Radius 10px
- No border, no shadow
- Padding 16–24px

#### Navigation (Public)
- Fixed top, frosted glass background
- Logo left, links + CTA right
- CTA: black button

#### Sidebar (Admin)
- 200px wide, white background
- Active item: #f0f5f0 background, #1a1a1a text, radius 8px
- Inactive items: no background, #71717a text

#### Tables (Admin)
- No row borders — use subtle background alternation or whitespace
- Column headers: uppercase micro style
- Row padding: 10–12px vertical

## Screen Inventory

### Public Pages

#### 1. Landing Page (`/`)
- Frosted glass navbar
- Hero: display headline "Get funded. Keep moving.", subtext, two CTAs (black button + text link)
- Green pill badge: "Loans for gig workers"
- Trust bar: 3 sage-toned stat cards (5 min, $10K, 14+ platforms)
- "How it works" section: 3-step flow (Apply → Verify → Fund)
- Social proof section (optional): cycling testimonial toasts
- Footer

#### 2. Application Flow (`/apply`) — 7 steps
- Simple nav: logo + step counter
- Thin black progress bar
- Centered form (max-width 400px)
- Each step has a conversational headline ("How much do you need?", "Tell us about yourself", etc.)
- Step 1: Amount slider + term pills + monthly estimate
- Step 2: Name, email, phone inputs
- Step 3: Platform selection (grid of platform pills)
- Step 4: SSN input (masked, with security message)
- Step 5: Plaid bank linking
- Step 6: Document upload
- Step 7: Review & submit
- Black "Continue" button on every step

#### 3. Status Checker (`/status`)
- Simple centered layout
- Input for application code
- Black "Check Status" button

#### 4. Status Detail (`/status/[code]`)
- Loan status card with badge
- Loan details (amount, term, rate, monthly payment)
- Payment schedule table
- Balance overview

#### 5. Legal Pages (`/terms`, `/privacy`, `/disclosures`)
- Clean typography, max-width 680px
- Heading hierarchy with the type scale
- No special styling needed — just good typography

### Admin Pages

#### 6. Login (`/admin/login`)
- Centered card on #f8faf8 background
- Logo, email/password inputs, black "Sign In" button

#### 7. Dashboard (`/admin/dashboard`)
- Sidebar + main layout
- 4 stat cards: Active Loans, Outstanding, Pending, Default Rate
- Recent Applications table
- Quick action buttons

#### 8. Applications (`/admin/applications`)
- Sidebar + main layout
- Filter tabs by status (All, Pending, Approved, Active, Late, etc.)
- Applications table with status badges
- Search/filter bar

#### 9. Application Detail (`/admin/applications/[id]`)
- Sidebar + main layout
- Risk score card (circular or bar indicator)
- Personal info section
- Loan details section
- Plaid data (income, bank balance)
- Action buttons: Approve (black), Reject (red outline), Fund (black)
- Payment schedule table (if funded)
- Audit trail for this application

#### 10. Payments (`/admin/payments`)
- Sidebar + main layout
- Filter tabs by status
- Payments table with retry/settle actions

#### 11. Audit Log (`/admin/audit`)
- Sidebar + main layout
- Filter by action type
- Chronological event list

#### 12. Settings (`/admin/settings`)
- Sidebar + main layout
- Grouped settings cards (loan limits, rates, fees)
- Inline editing with save buttons

## Animation & Motion

- **Library:** Framer Motion (keep existing)
- **Page transitions:** fade + slide up (opacity 0→1, y 20→0, 400ms)
- **Card entrances:** staggered fade-in (100ms delay between cards)
- **Button hover:** subtle scale (1.02) + background transition
- **Progress bar:** smooth width transition on step change
- **Slider:** real-time value update with spring physics
- **Keep it subtle.** Premium = restrained motion. No bouncy or playful animations.

## Technical Implementation

### shadcn/ui CSS Variable Mapping

Replace the `:root` block in `globals.css` with:

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
}
```

**Dark mode:** Remove the `.dark` block entirely. LimeCredit is light-mode only. The warm off-white background is core to the Sage & Stone identity — a dark mode would undermine it. If dark mode is needed later, it can be designed as a separate effort.

### Font Loading

Use **Inter** as the primary font (available on Google Fonts, grotesque-adjacent, excellent at tight tracking). This avoids the complexity of self-hosting General Sans or Satoshi while delivering 90% of the same aesthetic. Inter at weight 800 with -0.03em tracking reads very close to a premium grotesque.

In `layout.tsx`, replace the Geist import:

```tsx
import { Inter } from "next/font/google";
import { Geist_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
```

Keep `Geist Mono` for application codes and monospace content.

### Additional CSS Tokens

Add these custom properties for tokens not covered by shadcn:

```css
:root {
  /* ... shadcn variables above ... */
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

### Route Clarification

The `/admin/applications` page does not exist as a separate route today — the applications table lives inside `dashboard-client.tsx`. The redesign should **extract it into its own route** (`/admin/applications/page.tsx`) to improve navigation clarity. The dashboard keeps the stat cards + a "Recent Applications" preview (5 rows max), and the full filterable table moves to `/admin/applications`.

### Component Notes

- **Toasts (Sonner):** Style with white background, 10px radius, no border, subtle shadow (`0 8px 32px rgba(0,0,0,0.08)`). Success toasts use sage green icon, error toasts use destructive red.
- **Modals/Dialogs:** White background, 12px radius, overlay at `rgba(0,0,0,0.4)`, shadow `0 8px 32px rgba(0,0,0,0.08)`. Padding `p-6`. Close button: subtle gray icon top-right.
- **Select dropdowns:** Same styling as inputs (white bg, 10px radius). Dropdown panel: white, 10px radius, floating shadow.
- **Textareas:** Same as inputs. Min-height 120px.
- **Form errors:** Red text below input (`text-destructive`, 13px), input gets 1px `destructive` border on error.
- **Loading states:** Skeleton loaders using `surface-muted` (#f0f5f0) with subtle pulse animation. No spinners.
- **Empty states:** Centered text in `foreground-muted`, no illustrations.
- **Icons:** Lucide React (already in use). 18px default, `foreground-muted` color.
- **Admin action buttons:** Disabled state: opacity 50%. Loading state: text replaced with skeleton pulse. Approve/Fund confirm via dialog modal.

## Migration Notes

- Replace all emerald/green color references with the Sage & Stone palette
- Replace Geist font with Inter
- Update shadcn/ui theme variables in globals.css per the mapping above
- Remove the `.dark` theme block
- Remove pill-shaped buttons (rounded-full) for primary CTAs — use rounded-lg/xl instead
- Keep shadcn/ui component library — just retheme
- Update "Elilons" / "1099 Loan Portal" brand references to "LimeCredit" throughout
- Extract applications table from dashboard into `/admin/applications` route
- Stitch project created: `projects/10348919557216453485`

## Out of Scope

- No changes to business logic, API routes, or database schema
- No changes to Plaid integration flow
- No new features beyond the applications route extraction
- No mobile-specific layouts (responsive tweaks are fine, but no mobile-first redesign)
- No dark mode
