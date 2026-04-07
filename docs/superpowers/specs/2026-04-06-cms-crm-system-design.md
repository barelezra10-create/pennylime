# CreditLime CMS + CRM System Design

**Date:** 2026-04-06
**Status:** Approved

---

## 1. Overview

Transform the CreditLime admin from a basic loan management panel into a full CMS + CRM platform. Four phases:

1. **Contact Database & CRM** — unified contact model, pipeline, activity tracking, team management
2. **Abandoned Application Tracking + Form Builder** — capture partial apps, customizable application forms
3. **Email Marketing** — automated sequences, manual campaigns, drip builder, templates
4. **Admin UI Redesign** — modern SaaS dashboard (Linear/Notion-inspired), command palette, tabbed editors

Design patterns from Phase 4 are applied incrementally as each phase is built, so new pages ship polished from day one.

---

## 2. Phase 1: Contact Database & CRM

### 2.1 Contact Model

Single source of truth for every person who interacts with CreditLime. Auto-created when a user completes Step 2 of /apply (name, email, phone captured).

```prisma
model Contact {
  id              String    @id @default(uuid())
  firstName       String
  lastName        String?
  email           String    @unique
  phone           String?
  // Pipeline
  stage           String    @default("LEAD")  // LEAD, CONTACTED, APPLICANT, APPROVED, FUNDED, REPAYING, PAID_OFF, DEFAULTED, LOST
  // Assignment
  assignedRepId   String?
  assignedRep     AdminUser? @relation(fields: [assignedRepId], references: [id])
  // Source tracking
  source          String?   // "lp:uber-lyft-driver-loans", "direct", "organic"
  utmSource       String?
  utmCampaign     String?
  utmMedium       String?
  // Application link
  applicationId   String?   @unique
  application     Application? @relation(fields: [applicationId], references: [id])
  lastAppStep     Int?      // 1-7, last step completed in /apply
  // Meta
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  // Relations
  tags            ContactTag[]
  activities      Activity[]
  emailEvents     EmailEvent[]
  sequenceEnrollments SequenceEnrollment[]

  @@index([stage])
  @@index([assignedRepId])
  @@index([email])
  @@index([createdAt])
}
```

### 2.2 Tags

```prisma
model Tag {
  // existing Tag model is for articles — add a new ContactTag model
}

model ContactTag {
  id        String  @id @default(uuid())
  contactId String
  tag       String  // freeform string: "uber-driver", "high-value", "abandoned-app", "hot-lead"
  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@unique([contactId, tag])
  @@index([contactId])
  @@index([tag])
}
```

### 2.3 Activity Timeline

```prisma
model Activity {
  id        String   @id @default(uuid())
  contactId String
  type      String   // "app_started", "app_step_completed", "app_submitted", "app_approved",
                     // "app_rejected", "payment_made", "email_sent", "email_opened",
                     // "email_clicked", "note_added", "call_logged", "stage_changed",
                     // "tag_added", "tag_removed", "assigned"
  title     String   // human-readable: "Completed Step 3: Platforms"
  details   String?  // JSON or text with extra context
  performedBy String? // AdminUser id for manual actions, "system" for auto
  contact   Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@index([contactId])
  @@index([type])
  @@index([createdAt])
}
```

### 2.4 AdminUser Changes

Add `role` field and relation to Contact:

```prisma
model AdminUser {
  // existing fields...
  role        String   @default("ADMIN")  // "ADMIN" or "REP"
  contacts    Contact[]  // assigned contacts
}
```

### 2.5 Pipeline Stages

```
LEAD → CONTACTED → APPLICANT → APPROVED → FUNDED → REPAYING → PAID_OFF
  ↓        ↓                       ↓                              ↓
 LOST     LOST                  REJECTED                     DEFAULTED
```

- `LEAD` — contact created (started app or manually added)
- `CONTACTED` — rep has reached out (manual or auto-email)
- `APPLICANT` — completed and submitted the application
- `APPROVED` — loan approved
- `FUNDED` — money disbursed
- `REPAYING` — active loan with payments
- `PAID_OFF` — loan fully repaid
- `DEFAULTED` — missed payments, in collections
- `LOST` — won't continue (manual mark by rep)
- `REJECTED` — application denied

### 2.6 Admin Pages

**Pipeline (Kanban)** — `/admin/pipeline`
- Columns: LEAD, CONTACTED, APPLICANT, APPROVED, FUNDED, REPAYING
- Each card shows: name, email, source, last activity time, assigned rep avatar
- Drag cards between columns to change stage (logs activity)
- Filter bar: by rep, source, tag, date range
- Card click opens contact detail

**Contacts list** — `/admin/contacts`
- Table: name, email, phone, stage (badge), source, assigned rep, tags, created date
- Search by name/email/phone
- Filter by: stage, tag, rep, source, date range
- Bulk actions: assign rep, add tag, change stage, enroll in sequence
- "Export CSV" button

**Contact detail** — `/admin/contacts/[id]`
- Tabbed layout:
  - **Overview** — info card (name, email, phone, source, UTM), stage badge, assigned rep selector, tags (add/remove)
  - **Activity** — chronological timeline of all activities (auto + manual), with "Add Note" and "Log Call" quick actions
  - **Emails** — list of all emails sent to this contact, with status (sent/opened/clicked)
  - **Application** — embedded view of linked application details (if exists), or "No application yet" with link to their /apply progress
  - **Notes** — dedicated notes section (rep can add markdown notes)

**Team** — `/admin/team`
- List of AdminUsers with role (Admin/Rep)
- Add new team member (email, name, role, password)
- Edit role, deactivate
- Admin sees all, Rep sees only assigned contacts

### 2.7 Auto-Contact Creation

Hook into the /apply form Step 2 completion:
- When `firstName`, `email`, `phone` are submitted (transitioning from Step 2 to Step 3), fire a server action
- Upsert Contact by email (don't create duplicates)
- Set `stage: "LEAD"`, `source` from UTM params, `lastAppStep: 2`
- Log activity: "Application started"
- On each subsequent step: update `lastAppStep`, log activity
- On final submit: update `stage: "APPLICANT"`, link `applicationId`, remove `abandoned-app` tag

---

## 3. Phase 2: Abandoned Application Tracking + Form Builder

### 3.1 Abandoned Application Tracking

Contacts with `stage = "LEAD"` and `lastAppStep < 7` are abandoned applications. No new model needed — it's a view/filter on the Contact model.

**Admin page** — `/admin/abandoned`
- Table: name, email, phone, platform, last step reached (with step name, e.g., "Step 4: Identity"), time since started, source, assigned rep
- Sort by: last step (higher = warmer lead), recency
- Quick actions: assign rep, send follow-up email, mark as contacted, mark as lost
- Summary stats at top: total abandoned this week, avg step reached, top dropout step, recovery rate

**Auto-tagging:**
- When a contact has `lastAppStep < 7` and hasn't progressed in 1 hour, auto-add tag `abandoned-app`
- Tag is auto-removed if they complete the application

### 3.2 Form Builder

**FormTemplate model:**

```prisma
model FormTemplate {
  id          String   @id @default(uuid())
  name        String   @unique  // "Default", "Uber Driver Short", "Freelancer"
  slug        String   @unique
  description String?
  steps       String   @default("[]")  // JSON: FormStep[]
  isDefault   Boolean  @default(false)
  published   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([slug])
}
```

**FormStep JSON structure:**

```typescript
interface FormStep {
  id: string;           // unique step id
  title: string;        // "Your Info"
  description: string;  // "Tell us about yourself"
  order: number;        // display order
  enabled: boolean;     // toggle on/off
  type: "builtin" | "custom";  // builtin = existing hardcoded step, custom = dynamic fields
  builtinKey?: string;  // "amount" | "info" | "platforms" | "identity" | "bank" | "documents" | "review"
  customFields?: FormField[];  // only for type: "custom"
}

interface FormField {
  id: string;
  label: string;
  type: "text" | "number" | "select" | "file" | "checkbox" | "textarea";
  placeholder?: string;
  required: boolean;
  options?: string[];  // for select type
  order: number;
}
```

**How it works:**
- The default form template matches the current 7-step flow (all builtin steps, all enabled)
- Admin can create new templates: clone the default, then toggle steps off, reorder, add custom steps with custom fields
- Landing pages link to a form template via `formTemplateSlug` field
- `/apply` reads `?template=slug` from URL params. If no template, uses the default.
- Builtin steps render the existing hardcoded React components
- Custom steps render a dynamic form from the field definitions

**Admin page** — `/admin/content/form-templates`
- List of templates with name, step count, linked LPs, status
- Editor: drag-to-reorder steps, toggle switches, edit labels/descriptions, add custom steps with field builder
- Preview button (opens /apply?template=slug in new tab)

### 3.3 Landing Page → Form Template Link

Add to LandingPage model:
```prisma
formTemplateSlug String?  // links to a FormTemplate, defaults to null (use default form)
```

The landing page form's "Start My Application" button will include `&template=<slug>` in the /apply redirect URL if a template is linked.

---

## 4. Phase 3: Email Marketing

### 4.1 Data Models

```prisma
model EmailTemplate {
  id        String   @id @default(uuid())
  name      String
  subject   String
  body      String   // HTML from Tiptap editor
  category  String?  // "transactional", "marketing", "sequence"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model EmailCampaign {
  id            String    @id @default(uuid())
  name          String
  subject       String
  body          String    // HTML from Tiptap editor
  templateId    String?   // optional base template
  // Audience
  segmentRules  String    @default("[]")  // JSON: SegmentRule[]
  audienceCount Int       @default(0)     // cached count at send time
  // Schedule
  status        String    @default("DRAFT")  // DRAFT, SCHEDULED, SENDING, SENT, CANCELLED
  scheduledAt   DateTime?
  sentAt        DateTime?
  // Stats
  totalSent     Int       @default(0)
  totalOpened   Int       @default(0)
  totalClicked  Int       @default(0)
  // Meta
  createdBy     String
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([status])
}

model EmailSequence {
  id          String   @id @default(uuid())
  name        String   // "Abandoned App Recovery", "Uber Driver Nurture"
  description String?
  steps       String   @default("[]")  // JSON: SequenceStep[]
  triggerType String   // "manual", "abandoned_app", "stage_change", "tag_added"
  triggerValue String? // e.g., stage name or tag name
  active      Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model SequenceEnrollment {
  id          String    @id @default(uuid())
  contactId   String
  sequenceId  String
  currentStep Int       @default(0)
  status      String    @default("ACTIVE")  // ACTIVE, PAUSED, COMPLETED, CANCELLED
  nextSendAt  DateTime?
  contact     Contact   @relation(fields: [contactId], references: [id], onDelete: Cascade)
  enrolledAt  DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([contactId, sequenceId])
  @@index([status])
  @@index([nextSendAt])
}

model EmailEvent {
  id         String   @id @default(uuid())
  contactId  String
  campaignId String?
  sequenceId String?
  type       String   // "sent", "delivered", "opened", "clicked", "bounced", "unsubscribed"
  subject    String?
  messageId  String?  // Resend message ID for tracking
  contact    Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())

  @@index([contactId])
  @@index([campaignId])
  @@index([type])
}
```

### 4.2 Segment Rules

```typescript
interface SegmentRule {
  field: "stage" | "tag" | "source" | "utmCampaign" | "assignedRepId" | "lastAppStep" | "createdAt";
  operator: "is" | "is_not" | "contains" | "gt" | "lt" | "between";
  value: string | string[];
}
```

Multiple rules are AND-joined. The admin UI shows a filter builder: pick field → pick operator → enter value. Shows live audience count.

### 4.3 Sequence Steps

```typescript
interface SequenceStep {
  id: string;
  order: number;
  subject: string;
  body: string;       // HTML
  delayAmount: number; // e.g., 24
  delayUnit: "hours" | "days";  // → nextSendAt = previous + delay
}
```

### 4.4 Automated Sequences (pre-built, toggleable)

These are seeded as EmailSequence records with `triggerType`:

| Sequence | Trigger | Steps |
|----------|---------|-------|
| Abandoned App Recovery | `abandoned_app` (1h after lastAppStep stops updating) | 1h: "You're almost done" · 24h: "Still need funds?" · 48h: "Your loan amount is reserved" · 7d: "Last chance" |
| Application Submitted | `stage_change` → APPLICANT | Immediate: confirmation email |
| Loan Approved | `stage_change` → APPROVED | Immediate: congrats + next steps |
| Loan Funded | `stage_change` → FUNDED | Immediate: celebration + repayment info |
| Payment Reminder | `payment_due` (3 days before) | -3d: upcoming reminder · 0d: due today · +1d: overdue |
| Re-engagement | `inactive_30d` | 30d: "We miss you" · 45d: "Special offer" |

All toggleable on/off from admin. Editable subject/body/delays.

### 4.5 Resend Integration

- Send emails via existing Resend SDK (`resend` package already installed)
- Webhook endpoint at `/api/email/webhook` receives Resend events (delivered, opened, clicked, bounced)
- Webhook creates EmailEvent records and Activity entries on the contact
- Unsubscribe: add `unsubscribed` tag to contact, exclude from all future sends
- Unsubscribe link in every marketing email footer

### 4.6 Email Execution

- A cron job (or Next.js API route called by Railway cron) runs every 5 minutes
- Queries SequenceEnrollment where `status = "ACTIVE"` and `nextSendAt <= now()`
- Sends the email, creates EmailEvent, advances `currentStep`, calculates next `nextSendAt`
- If last step, sets `status = "COMPLETED"`
- Same cron handles scheduled campaigns: if `status = "SCHEDULED"` and `scheduledAt <= now()`, resolve audience, batch send

### 4.7 Admin Pages

**Email Marketing hub** — `/admin/email`
- Dashboard: emails sent this week, open rate, click rate, active sequences, upcoming scheduled campaigns

**Campaigns** — `/admin/email/campaigns`
- List: name, status, audience count, sent/opened/clicked, date
- Editor: subject, body (Tiptap), segment builder, schedule picker, preview, send/schedule

**Sequences** — `/admin/email/sequences`
- List: name, trigger, steps count, active toggle, enrolled count
- Editor: name, trigger config, step builder (subject + body + delay for each step, add/remove/reorder)

**Templates** — `/admin/email/templates`
- List: name, category, last edited
- Editor: name, subject, body (Tiptap)

---

## 5. Phase 4: Admin UI Redesign

### 5.1 Navigation

Replace current fixed sidebar with a collapsible grouped sidebar:

```
[Logo]  [collapse toggle]

MAIN
  Dashboard
  Pipeline

CRM
  Contacts
  Abandoned Apps

EMAIL
  Campaigns
  Sequences
  Templates

LENDING
  Applications
  Payments

CONTENT
  Articles
  Platform Pages
  State Pages
  Tools
  Comparisons
  Landing Pages
  Form Templates
  Categories
  Images

SYSTEM
  Settings
  Audit Log
  Team
```

- Sidebar sections are collapsible (click header to toggle)
- Collapsed mode: icon-only sidebar (48px wide) with tooltips
- Active item: sage green left border + green tinted background
- Section headers: 10px uppercase gray text

### 5.2 Command Palette (Cmd+K)

- Global keyboard shortcut opens a search/command modal
- Search contacts by name/email/phone
- Navigate to any admin page
- Quick actions: "Create campaign", "New landing page", "Add contact"
- Recent items shown when opened empty
- Results grouped by type (Contacts, Pages, Actions)

### 5.3 Page Layout Patterns

**List pages:**
- Page header bar: title (bold, 24px) + description (gray, 14px) + primary action button (top right)
- Filter bar below header: search input + filter pills (stage, tag, date) + sort dropdown
- Table with: sticky header, alternating row hover, inline quick-action buttons (right side), checkbox column for bulk select
- Pagination: page numbers + "Showing 1-25 of 342"
- Empty state: centered illustration + text + CTA

**Detail pages (contacts, campaigns, sequences):**
- Horizontal tabs at top (Overview, Activity, Emails, Notes, Application)
- Each tab loads its content in place (no route change, React state)
- Right sidebar on detail pages: quick info card (stage, rep, tags, dates)

**Editor pages (content, LP, form templates, email campaigns):**
- Horizontal tab bar replacing the long vertical scroll: e.g., LP editor becomes [Hero] [Content] [Form] [SEO] [Publish] tabs
- Each tab is a focused card section
- Sticky save/publish bar at bottom

### 5.4 Card Patterns (Settings-quality everywhere)

- White background, rounded-xl (12px), subtle shadow-sm
- Section header: icon (in colored circle bg) + bold title + gray description
- Form fields: light gray bg (#f4f4f5), rounded-lg, focus ring in sage green
- Consistent 16px padding inside cards, 8px gaps between cards
- Colored accent panels for important metrics (green for positive, amber for warning, red for alert)

### 5.5 Dashboard Upgrade

Current: 4 stat cards + recent applications table.

New dashboard:
- **Top row (4 cards):** Active loans, Revenue this month, New leads this week, Conversion rate
- **Second row (2 cards):**
  - Conversion funnel (horizontal bar): Leads → Applicants → Approved → Funded (with counts + percentages)
  - Abandoned app chart: dropout by step (bar chart showing how many drop at each step)
- **Third row:**
  - Recent activity feed (last 10 activities across all contacts)
  - Upcoming: scheduled emails, due payments, pending reviews

### 5.6 Responsive

- Sidebar collapses to icon-only below 1280px
- Tables become card lists on mobile (< 768px)
- Command palette works on all screen sizes

---

## 6. Data Flow: Application → Contact → CRM

```
User lands on /lp/uber-lyft-driver-loans
  ↓ clicks "Start My Application"
  ↓ redirected to /apply?amount=3000&term=4&platform=Uber&template=default&utm_source=lp&utm_campaign=uber-lyft

/apply Step 1: Amount
  → user selects amount + term (no contact created yet)

/apply Step 2: Your Info
  → user enters name, email, phone
  → on "Next": server action upserts Contact {email, firstName, phone, stage: LEAD, source: "lp:uber-lyft-driver-loans", utmSource, utmCampaign, lastAppStep: 2}
  → Activity logged: "Application started from Uber/Lyft landing page"
  → Tag auto-added: "uber-driver" (from platform param)

/apply Step 3-6: user progresses
  → each step: update Contact.lastAppStep, log Activity

User drops off at Step 4
  → after 1 hour: auto-tag "abandoned-app"
  → Abandoned App Recovery sequence triggered: enrollment created
  → 1h email: "Hey {firstName}, you were almost there..."
  → 24h email: "Still need that ${amount}?"
  → Contact visible in /admin/abandoned + Pipeline as LEAD

Rep sees in Pipeline → drags to CONTACTED → adds note "Called, voicemail"
  → Activity logged: stage changed, note added

User returns via email link → completes app
  → Contact.stage → APPLICANT, tag "abandoned-app" removed
  → Sequence enrollment cancelled (completed app = exit trigger)
  → Contact.applicationId linked

Admin approves → stage → APPROVED → FUNDED → REPAYING → PAID_OFF
  → Each transition logs Activity + triggers appropriate email sequence
```

---

## 7. New Packages

- None required. Resend (email), Tiptap (editor), Prisma (DB), Tailwind (UI) are all already installed.
- For the Kanban board: use a lightweight drag library or build with HTML drag-and-drop API + Tailwind. No external dependency needed.
- For charts on dashboard: use a small chart library like `recharts` or build simple bar charts with CSS/SVG.

---

## 8. Migration Safety

All new models are additive — no changes to existing Application, Payment, or existing content models. The only existing model touched is AdminUser (add `role` field with default "ADMIN" so existing users keep access).

Contact links to Application via optional `applicationId` — existing applications remain untouched until a Contact record is created for them.

---

## 9. Implementation Phases

| Phase | What ships | New routes | New models |
|-------|-----------|------------|------------|
| 1 | Contact DB, pipeline, contact detail, team mgmt | /admin/pipeline, /admin/contacts, /admin/contacts/[id], /admin/team | Contact, ContactTag, Activity |
| 2 | Abandoned tracking, form builder | /admin/abandoned, /admin/content/form-templates | FormTemplate |
| 3 | Email marketing (campaigns, sequences, templates, automation) | /admin/email, /admin/email/campaigns, /admin/email/sequences, /admin/email/templates, /api/email/webhook, /api/email/cron | EmailTemplate, EmailCampaign, EmailSequence, SequenceEnrollment, EmailEvent |
| 4 | Admin UI overhaul (sidebar, command palette, tabbed editors, dashboard, consistent patterns) | All existing routes redesigned | None |

Each phase produces working software. Phase 4 patterns (cards, tabs, layout) are applied to new pages as they're built in Phases 1-3.
