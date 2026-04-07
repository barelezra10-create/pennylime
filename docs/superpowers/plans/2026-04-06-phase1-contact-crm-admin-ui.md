# Phase 1: Contact Database, CRM & Admin UI Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified Contact database, CRM pipeline (Kanban), contact detail pages with activity timelines, team management, and a modern collapsible admin sidebar with command palette — establishing the UI patterns for all future phases.

**Architecture:** New Prisma models (Contact, ContactTag, Activity) link to existing AdminUser and Application. Auto-contact creation hooks into the /apply form's Step 2 transition. Admin UI rebuilt with collapsible grouped sidebar, Cmd+K command palette, and settings-quality card patterns on all new pages.

**Tech Stack:** Next.js 16, Prisma 7 (SQLite), Tailwind 4, React 19, Sonner (toasts), existing auth via NextAuth. No new packages except `recharts` for dashboard charts.

**Spec:** `docs/superpowers/specs/2026-04-06-cms-crm-system-design.md`

---

## File Structure

### New Files

```
prisma/
  schema.prisma                                  (MODIFY — add Contact, ContactTag, Activity, AdminUser.role)

src/
  actions/
    contacts.ts                                  (server actions: Contact CRUD, upsert, stage change)
    activities.ts                                 (server actions: log activity, get timeline)
    team.ts                                       (server actions: team member CRUD)

  components/
    admin/
      sidebar.tsx                                (REPLACE admin-sidebar.tsx — collapsible grouped sidebar)
      command-palette.tsx                         (Cmd+K search/navigate modal)
      page-header.tsx                            (reusable page header: title + desc + action)
      data-table.tsx                             (reusable table: search, filter, sort, pagination, bulk select)
      stat-card.tsx                              (reusable colored metric card)
      tab-bar.tsx                                (reusable horizontal tabs component)
      empty-state.tsx                            (reusable empty state with icon + text + CTA)
      stage-badge.tsx                            (colored badge for pipeline stages)
      contact-card.tsx                           (small card for pipeline Kanban)

  app/
    admin/
      layout.tsx                                 (MODIFY — use new Sidebar, add CommandPalette)

      pipeline/
        page.tsx                                 (server — fetch contacts grouped by stage)
        pipeline-client.tsx                      (client — Kanban board with drag-to-change-stage)

      contacts/
        page.tsx                                 (server — fetch contacts with filters)
        contacts-client.tsx                      (client — data table with search/filter/bulk)
        [id]/
          page.tsx                               (server — fetch single contact + activity + emails)
          contact-detail-client.tsx              (client — tabbed detail view)

      team/
        page.tsx                                 (server — fetch admin users)
        team-client.tsx                          (client — team list with add/edit/role)

      dashboard/
        page.tsx                                 (MODIFY — richer data fetching)
        dashboard-client.tsx                     (MODIFY — funnel chart, activity feed, better cards)

  lib/
    contact-helpers.ts                           (stage transitions, tag helpers, UTM parsing)
```

### Modified Files

```
prisma/schema.prisma                             (add Contact, ContactTag, Activity models + AdminUser.role)
src/components/admin-sidebar.tsx                 (REPLACED by src/components/admin/sidebar.tsx)
src/app/admin/layout.tsx                         (new sidebar + command palette)
src/app/admin/dashboard/page.tsx                 (fetch contact metrics)
src/app/admin/dashboard/dashboard-client.tsx     (new dashboard layout)
src/app/(public)/apply/page.tsx                  (hook into Step 2 to create Contact)
src/middleware.ts                                (add new admin routes to matcher)
package.json                                     (add recharts)
```

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install recharts for dashboard charts**

```bash
cd /Users/baralezrah/loan-portal
npm install recharts
```

- [ ] **Step 2: Verify**

```bash
node -e "require('recharts'); console.log('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add recharts for admin dashboard charts"
```

---

## Task 2: Prisma Schema — Contact, ContactTag, Activity Models + AdminUser Role

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add role field to AdminUser**

Find the existing AdminUser model. Add `role` field with default:

```prisma
model AdminUser {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String
  name         String
  role         String    @default("ADMIN")
  createdAt    DateTime  @default(now())
  contacts     Contact[]
}
```

- [ ] **Step 2: Add Contact, ContactTag, Activity models**

Append after the LandingPage model (at the end of the file):

```prisma
// ─── CRM ─────────────────────────────────────────────────────

model Contact {
  id              String    @id @default(uuid())
  firstName       String
  lastName        String?
  email           String    @unique
  phone           String?
  stage           String    @default("LEAD")
  assignedRepId   String?
  assignedRep     AdminUser? @relation(fields: [assignedRepId], references: [id])
  source          String?
  utmSource       String?
  utmCampaign     String?
  utmMedium       String?
  applicationId   String?   @unique
  application     Application? @relation(fields: [applicationId], references: [id])
  lastAppStep     Int?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  tags            ContactTag[]
  activities      Activity[]

  @@index([stage])
  @@index([assignedRepId])
  @@index([email])
  @@index([createdAt])
}

model ContactTag {
  id        String  @id @default(uuid())
  contactId String
  tag       String
  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@unique([contactId, tag])
  @@index([contactId])
  @@index([tag])
}

model Activity {
  id          String   @id @default(uuid())
  contactId   String
  type        String
  title       String
  details     String?
  performedBy String?
  contact     Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())

  @@index([contactId])
  @@index([type])
  @@index([createdAt])
}
```

- [ ] **Step 3: Add relation field to Application model**

In the existing Application model, add the reverse relation. Find the closing `}` of the Application model and before it add:

```prisma
  contact         Contact?
```

- [ ] **Step 4: Run migration**

```bash
npx prisma migrate dev --name add_crm_models
```

- [ ] **Step 5: Verify**

```bash
node -e "const { PrismaClient } = require('./src/generated/prisma/client'); const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3'); const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: 'file:./dev.db' }) }); console.log(typeof p.contact, typeof p.contactTag, typeof p.activity)"
```

Expected: `object object object`

- [ ] **Step 6: Commit**

```bash
git add prisma/
git commit -m "feat: add Contact, ContactTag, Activity CRM models + AdminUser role"
```

---

## Task 3: Contact & Activity Server Actions

**Files:**
- Create: `src/actions/contacts.ts`
- Create: `src/actions/activities.ts`
- Create: `src/lib/contact-helpers.ts`

- [ ] **Step 1: Create contact helpers**

Create `src/lib/contact-helpers.ts`:

```typescript
export const PIPELINE_STAGES = [
  "LEAD",
  "CONTACTED",
  "APPLICANT",
  "APPROVED",
  "REJECTED",
  "FUNDED",
  "REPAYING",
  "PAID_OFF",
  "DEFAULTED",
  "LOST",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  LEAD: { bg: "bg-[#f4f4f5]", text: "text-[#71717a]" },
  CONTACTED: { bg: "bg-[#eff6ff]", text: "text-[#2563eb]" },
  APPLICANT: { bg: "bg-[#fef9ec]", text: "text-[#b45309]" },
  APPROVED: { bg: "bg-[#f0fdf4]", text: "text-[#15803d]" },
  REJECTED: { bg: "bg-[#fef2f2]", text: "text-[#dc2626]" },
  FUNDED: { bg: "bg-[#f0fdf4]", text: "text-[#15803d]" },
  REPAYING: { bg: "bg-[#eff6ff]", text: "text-[#2563eb]" },
  PAID_OFF: { bg: "bg-[#f0fdf4]", text: "text-[#166534]" },
  DEFAULTED: { bg: "bg-[#fef2f2]", text: "text-[#dc2626]" },
  LOST: { bg: "bg-[#f4f4f5]", text: "text-[#71717a]" },
};

export const KANBAN_STAGES: PipelineStage[] = [
  "LEAD",
  "CONTACTED",
  "APPLICANT",
  "APPROVED",
  "FUNDED",
  "REPAYING",
];

export function parseUtmParams(searchParams: URLSearchParams) {
  return {
    utmSource: searchParams.get("utm_source") || undefined,
    utmCampaign: searchParams.get("utm_campaign") || undefined,
    utmMedium: searchParams.get("utm_medium") || undefined,
  };
}
```

- [ ] **Step 2: Create contact server actions**

Create `src/actions/contacts.ts`:

```typescript
"use server";

import { prisma } from "@/lib/db";

export async function getContacts(filters?: {
  stage?: string;
  tag?: string;
  assignedRepId?: string;
  search?: string;
  page?: number;
  perPage?: number;
}) {
  const where: Record<string, unknown> = {};
  if (filters?.stage) where.stage = filters.stage;
  if (filters?.assignedRepId) where.assignedRepId = filters.assignedRepId;
  if (filters?.tag) {
    where.tags = { some: { tag: filters.tag } };
  }
  if (filters?.search) {
    where.OR = [
      { firstName: { contains: filters.search } },
      { lastName: { contains: filters.search } },
      { email: { contains: filters.search } },
      { phone: { contains: filters.search } },
    ];
  }

  const page = filters?.page || 1;
  const perPage = filters?.perPage || 50;

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: { tags: true, assignedRep: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.contact.count({ where }),
  ]);

  return { contacts, total, totalPages: Math.ceil(total / perPage) };
}

export async function getContact(id: string) {
  return prisma.contact.findUnique({
    where: { id },
    include: {
      tags: true,
      assignedRep: { select: { id: true, name: true } },
      application: true,
      activities: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
}

export async function getContactsByStage() {
  const contacts = await prisma.contact.findMany({
    include: { tags: true, assignedRep: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const grouped: Record<string, typeof contacts> = {};
  for (const c of contacts) {
    if (!grouped[c.stage]) grouped[c.stage] = [];
    grouped[c.stage].push(c);
  }
  return grouped;
}

export async function upsertContact(data: {
  email: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  source?: string;
  utmSource?: string;
  utmCampaign?: string;
  utmMedium?: string;
  lastAppStep?: number;
}) {
  return prisma.contact.upsert({
    where: { email: data.email },
    update: {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      lastAppStep: data.lastAppStep,
      utmSource: data.utmSource || undefined,
      utmCampaign: data.utmCampaign || undefined,
    },
    create: {
      ...data,
      stage: "LEAD",
    },
  });
}

export async function updateContactStage(id: string, stage: string) {
  return prisma.contact.update({ where: { id }, data: { stage } });
}

export async function updateContactLastStep(email: string, step: number) {
  return prisma.contact.update({ where: { email }, data: { lastAppStep: step } });
}

export async function assignContactRep(id: string, repId: string | null) {
  return prisma.contact.update({ where: { id }, data: { assignedRepId: repId } });
}

export async function linkContactApplication(email: string, applicationId: string) {
  return prisma.contact.update({
    where: { email },
    data: { applicationId, stage: "APPLICANT" },
  });
}

export async function addContactTag(contactId: string, tag: string) {
  return prisma.contactTag.upsert({
    where: { contactId_tag: { contactId, tag } },
    update: {},
    create: { contactId, tag },
  });
}

export async function removeContactTag(contactId: string, tag: string) {
  return prisma.contactTag.deleteMany({ where: { contactId, tag } });
}

export async function getContactMetrics() {
  const [total, byStage, thisWeek, abandoned] = await Promise.all([
    prisma.contact.count(),
    prisma.contact.groupBy({ by: ["stage"], _count: { id: true } }),
    prisma.contact.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.contact.count({
      where: { tags: { some: { tag: "abandoned-app" } } },
    }),
  ]);

  const stageMap: Record<string, number> = {};
  for (const s of byStage) stageMap[s.stage] = s._count.id;

  return { total, byStage: stageMap, newThisWeek: thisWeek, abandoned };
}
```

- [ ] **Step 3: Create activity server actions**

Create `src/actions/activities.ts`:

```typescript
"use server";

import { prisma } from "@/lib/db";

export async function logActivity(data: {
  contactId: string;
  type: string;
  title: string;
  details?: string;
  performedBy?: string;
}) {
  return prisma.activity.create({ data });
}

export async function getActivities(contactId: string, limit = 50) {
  return prisma.activity.findMany({
    where: { contactId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getRecentActivities(limit = 20) {
  return prisma.activity.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { contact: { select: { firstName: true, lastName: true, email: true } } },
  });
}
```

- [ ] **Step 4: Create team server actions**

Create `src/actions/team.ts`:

```typescript
"use server";

import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function getTeamMembers() {
  return prisma.adminUser.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function createTeamMember(data: {
  email: string;
  name: string;
  password: string;
  role: string;
}) {
  const passwordHash = await bcrypt.hash(data.password, 12);
  return prisma.adminUser.create({
    data: { email: data.email, name: data.name, passwordHash, role: data.role },
  });
}

export async function updateTeamMemberRole(id: string, role: string) {
  return prisma.adminUser.update({ where: { id }, data: { role } });
}

export async function deleteTeamMember(id: string) {
  await prisma.contact.updateMany({ where: { assignedRepId: id }, data: { assignedRepId: null } });
  return prisma.adminUser.delete({ where: { id } });
}
```

- [ ] **Step 5: Verify TS**

```bash
npx tsc --noEmit 2>&1 | grep -E "(contacts|activities|team|contact-helpers)" || echo "OK"
```

- [ ] **Step 6: Commit**

```bash
git add src/actions/contacts.ts src/actions/activities.ts src/actions/team.ts src/lib/contact-helpers.ts
git commit -m "feat: add CRM server actions (contacts, activities, team)"
```

---

## Task 4: Reusable Admin UI Components

**Files:**
- Create: `src/components/admin/page-header.tsx`
- Create: `src/components/admin/stat-card.tsx`
- Create: `src/components/admin/tab-bar.tsx`
- Create: `src/components/admin/empty-state.tsx`
- Create: `src/components/admin/stage-badge.tsx`
- Create: `src/components/admin/data-table.tsx`

These are the building blocks for all admin pages — settings-quality design applied consistently.

- [ ] **Step 1: Create PageHeader**

Create `src/components/admin/page-header.tsx`:

```tsx
import Link from "next/link";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <h1 className="text-[24px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">{title}</h1>
        {description && <p className="text-[14px] text-[#71717a] mt-1">{description}</p>}
      </div>
      {action && (
        action.href ? (
          <Link href={action.href} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] transition-colors">
            {action.label}
          </Link>
        ) : (
          <button onClick={action.onClick} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] transition-colors">
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create StatCard**

Create `src/components/admin/stat-card.tsx`:

```tsx
interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: "green" | "blue" | "amber" | "red" | "gray";
}

const COLOR_MAP = {
  green: { bg: "bg-[#f0fdf4]", icon: "bg-[#15803d]/10 text-[#15803d]" },
  blue: { bg: "bg-[#eff6ff]", icon: "bg-[#2563eb]/10 text-[#2563eb]" },
  amber: { bg: "bg-[#fffbeb]", icon: "bg-[#b45309]/10 text-[#b45309]" },
  red: { bg: "bg-[#fef2f2]", icon: "bg-[#dc2626]/10 text-[#dc2626]" },
  gray: { bg: "bg-white", icon: "bg-[#f4f4f5] text-[#71717a]" },
};

export function StatCard({ label, value, icon, color = "gray" }: StatCardProps) {
  const c = COLOR_MAP[color];
  return (
    <div className={`${c.bg} rounded-xl p-5 border border-transparent`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">{label}</p>
        {icon && <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.icon}`}>{icon}</div>}
      </div>
      <p className="text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">{value}</p>
    </div>
  );
}
```

- [ ] **Step 3: Create TabBar**

Create `src/components/admin/tab-bar.tsx`:

```tsx
"use client";

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, activeTab, onChange }: TabBarProps) {
  return (
    <div className="flex gap-1 border-b border-[#e4e4e7] mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
            activeTab === tab.id
              ? "border-[#15803d] text-[#15803d]"
              : "border-transparent text-[#71717a] hover:text-[#1a1a1a]"
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-[11px] bg-[#f4f4f5] rounded-full px-1.5 py-0.5">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create StageBadge**

Create `src/components/admin/stage-badge.tsx`:

```tsx
import { STAGE_COLORS } from "@/lib/contact-helpers";

export function StageBadge({ stage }: { stage: string }) {
  const colors = STAGE_COLORS[stage] || STAGE_COLORS.LEAD;
  return (
    <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold ${colors.bg} ${colors.text}`}>
      {stage.replace("_", " ")}
    </span>
  );
}
```

- [ ] **Step 5: Create EmptyState**

Create `src/components/admin/empty-state.tsx`:

```tsx
import Link from "next/link";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; href: string };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-16 px-6">
      {icon && <div className="mx-auto w-12 h-12 rounded-xl bg-[#f4f4f5] flex items-center justify-center text-[#a1a1aa] mb-4">{icon}</div>}
      <h3 className="text-[16px] font-bold text-[#1a1a1a] mb-1">{title}</h3>
      <p className="text-[14px] text-[#71717a] max-w-sm mx-auto">{description}</p>
      {action && (
        <Link href={action.href} className="inline-block mt-4 bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] transition-colors">
          {action.label}
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/
git commit -m "feat: add reusable admin UI components (PageHeader, StatCard, TabBar, StageBadge, EmptyState)"
```

---

## Task 5: Collapsible Admin Sidebar

Replace the existing `src/components/admin-sidebar.tsx` with a new collapsible, grouped sidebar.

**Files:**
- Create: `src/components/admin/sidebar.tsx`
- Modify: `src/app/admin/layout.tsx`
- Delete after: `src/components/admin-sidebar.tsx` (old sidebar)

- [ ] **Step 1: Create new sidebar component**

Create `src/components/admin/sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogoMark } from "@/components/brand/logo";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const ICON_CLASS = "w-[18px] h-[18px]";

// Simple SVG icons inline (avoid lucide dependency for sidebar)
function DashboardIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6Z" /></svg>; }
function PipelineIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m-2.25-3V6" /></svg>; }
function ContactsIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>; }
function AbandonedIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>; }
function EmailIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>; }
function AppsIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" /></svg>; }
function PaymentsIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>; }
function ContentIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6V7.5Z" /></svg>; }
function SettingsIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>; }
function AuditIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>; }
function TeamIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg>; }
function CollapseIcon({ collapsed }: { collapsed: boolean }) { return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={collapsed ? "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" : "M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25"} /></svg>; }

const NAV_GROUPS: NavGroup[] = [
  {
    title: "MAIN",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
      { href: "/admin/pipeline", label: "Pipeline", icon: <PipelineIcon /> },
    ],
  },
  {
    title: "CRM",
    items: [
      { href: "/admin/contacts", label: "Contacts", icon: <ContactsIcon /> },
      { href: "/admin/abandoned", label: "Abandoned Apps", icon: <AbandonedIcon /> },
    ],
  },
  {
    title: "EMAIL",
    items: [
      { href: "/admin/email", label: "Email Marketing", icon: <EmailIcon /> },
    ],
  },
  {
    title: "LENDING",
    items: [
      { href: "/admin/applications", label: "Applications", icon: <AppsIcon /> },
      { href: "/admin/payments", label: "Payments", icon: <PaymentsIcon /> },
    ],
  },
  {
    title: "CONTENT",
    items: [
      { href: "/admin/content", label: "All Content", icon: <ContentIcon /> },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { href: "/admin/settings", label: "Settings", icon: <SettingsIcon /> },
      { href: "/admin/audit", label: "Audit Log", icon: <AuditIcon /> },
      { href: "/admin/team", label: "Team", icon: <TeamIcon /> },
    ],
  },
];

export function AdminSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(NAV_GROUPS.map((g) => g.title)));

  const toggleGroup = (title: string) => {
    const next = new Set(openGroups);
    if (next.has(title)) next.delete(title);
    else next.add(title);
    setOpenGroups(next);
  };

  const initials = userName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <aside className={`${collapsed ? "w-[64px]" : "w-[220px]"} bg-white h-screen fixed flex flex-col border-r border-[#e4e4e7] transition-all duration-200 z-40`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-4 pb-3">
        {!collapsed && (
          <span className="inline-flex items-center gap-2 font-extrabold text-[15px] tracking-[-0.03em]">
            <LogoMark size={24} />
            Credit<span className="text-[#15803d]">Lime</span>
          </span>
        )}
        {collapsed && <LogoMark size={24} className="mx-auto" />}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg text-[#71717a] hover:bg-[#f4f4f5] transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <CollapseIcon collapsed={collapsed} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <button
                onClick={() => toggleGroup(group.title)}
                className="w-full flex items-center justify-between px-2 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#a1a1aa] hover:text-[#71717a]"
              >
                {group.title}
                <svg className={`w-3 h-3 transition-transform ${openGroups.has(group.title) ? "" : "-rotate-90"}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
              </button>
            )}
            {(collapsed || openGroups.has(group.title)) && (
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
                        active
                          ? "bg-[#f0f5f0] text-[#15803d] border-l-2 border-[#15803d]"
                          : "text-[#71717a] hover:bg-[#f4f4f5] hover:text-[#1a1a1a]"
                      } ${collapsed ? "justify-center px-2" : ""}`}
                    >
                      <span className={active ? "text-[#15803d]" : "text-[#a1a1aa] group-hover:text-[#71717a]"}>{item.icon}</span>
                      {!collapsed && item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className={`px-3 py-3 border-t border-[#e4e4e7] ${collapsed ? "px-2" : ""}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3 px-2 py-1.5"}`}>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#15803d] to-[#166534] text-[11px] font-bold text-white shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-[13px] font-medium text-[#1a1a1a]">{userName}</p>
            </div>
          )}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className={`mt-1.5 flex w-full items-center gap-3 rounded-lg py-2 text-[13px] font-medium text-[#71717a] transition-colors hover:bg-red-50 hover:text-red-600 ${collapsed ? "justify-center px-2" : "px-4"}`}
        >
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
          {!collapsed && "Sign Out"}
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Update admin layout to use new sidebar**

Read and modify `src/app/admin/layout.tsx`. Replace the old AdminSidebar import with the new one and adjust the margin for the wider sidebar:

```tsx
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-[#f8f8f6]">
      <AdminSidebar userName={session.user?.name || session.user?.email || "Admin"} />
      <main className="flex-1 p-6 overflow-auto ml-[220px] transition-all duration-200">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Delete old sidebar**

```bash
rm src/components/admin-sidebar.tsx
```

- [ ] **Step 4: Update middleware to add new routes**

Read `src/middleware.ts` and add the new admin routes to the matcher:

```typescript
export const config = {
  matcher: [
    "/admin/dashboard/:path*",
    "/admin/applications/:path*",
    "/admin/settings/:path*",
    "/admin/audit/:path*",
    "/admin/payments/:path*",
    "/admin/content/:path*",
    "/admin/pipeline/:path*",
    "/admin/contacts/:path*",
    "/admin/abandoned/:path*",
    "/admin/email/:path*",
    "/admin/team/:path*",
  ],
};
```

- [ ] **Step 5: Verify TS and build**

```bash
npx tsc --noEmit 2>&1 | grep -E "(sidebar|layout)" | head -10 || echo "OK"
npm run build 2>&1 | tail -10
```

Fix any import errors from files still referencing `@/components/admin-sidebar`. Common fix: the old import path `@/components/admin-sidebar` → `@/components/admin/sidebar`, and the export was `AdminSidebar` in both files.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: replace admin sidebar with collapsible grouped navigation

- Grouped sections: Main, CRM, Email, Lending, Content, System
- Collapsible sidebar (icon-only mode)
- Collapsible section groups
- Active state: green left border + green tint
- New admin routes in middleware matcher"
```

---

## Task 6: Command Palette (Cmd+K)

**Files:**
- Create: `src/components/admin/command-palette.tsx`
- Modify: `src/app/admin/layout.tsx` (add CommandPalette)

- [ ] **Step 1: Create command palette component**

Create `src/components/admin/command-palette.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface CommandItem {
  id: string;
  label: string;
  href?: string;
  group: string;
  icon?: React.ReactNode;
}

const NAV_ITEMS: CommandItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/admin/dashboard", group: "Navigate" },
  { id: "pipeline", label: "Pipeline", href: "/admin/pipeline", group: "Navigate" },
  { id: "contacts", label: "Contacts", href: "/admin/contacts", group: "Navigate" },
  { id: "abandoned", label: "Abandoned Apps", href: "/admin/abandoned", group: "Navigate" },
  { id: "email", label: "Email Marketing", href: "/admin/email", group: "Navigate" },
  { id: "applications", label: "Applications", href: "/admin/applications", group: "Navigate" },
  { id: "payments", label: "Payments", href: "/admin/payments", group: "Navigate" },
  { id: "content", label: "Content", href: "/admin/content", group: "Navigate" },
  { id: "landing-pages", label: "Landing Pages", href: "/admin/content/landing-pages", group: "Navigate" },
  { id: "articles", label: "Articles", href: "/admin/content/articles", group: "Navigate" },
  { id: "settings", label: "Settings", href: "/admin/settings", group: "Navigate" },
  { id: "audit", label: "Audit Log", href: "/admin/audit", group: "Navigate" },
  { id: "team", label: "Team", href: "/admin/team", group: "Navigate" },
  { id: "new-article", label: "New Article", href: "/admin/content/articles/new", group: "Create" },
  { id: "new-lp", label: "New Landing Page", href: "/admin/content/landing-pages/new", group: "Create" },
  { id: "new-campaign", label: "New Campaign", href: "/admin/email/campaigns/new", group: "Create" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Cmd+K / Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = query
    ? NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : NAV_ITEMS;

  const grouped = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const flatItems = Object.values(grouped).flat();

  const select = useCallback((item: CommandItem) => {
    setOpen(false);
    if (item.href) router.push(item.href);
  }, [router]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatItems[selectedIndex]) {
      select(flatItems[selectedIndex]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Palette */}
      <div className="relative w-full max-w-[520px] bg-white rounded-2xl shadow-2xl border border-[#e4e4e7] overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e4e4e7]">
          <svg className="w-5 h-5 text-[#a1a1aa]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search pages, contacts, actions..."
            className="flex-1 text-[14px] outline-none placeholder:text-[#a1a1aa]"
          />
          <kbd className="text-[11px] text-[#a1a1aa] bg-[#f4f4f5] px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[320px] overflow-y-auto py-2">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#a1a1aa]">{group}</p>
              {items.map((item) => {
                const idx = flatItems.indexOf(item);
                return (
                  <button
                    key={item.id}
                    onClick={() => select(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-[13px] text-left transition-colors ${
                      idx === selectedIndex ? "bg-[#f0f5f0] text-[#15803d]" : "text-[#1a1a1a] hover:bg-[#f4f4f5]"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
          {flatItems.length === 0 && (
            <p className="px-4 py-6 text-[13px] text-[#a1a1aa] text-center">No results for &ldquo;{query}&rdquo;</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add CommandPalette to admin layout**

In `src/app/admin/layout.tsx`, import and render it inside the layout (after the sidebar, before main):

Add import: `import { CommandPalette } from "@/components/admin/command-palette";`

Add `<CommandPalette />` inside the return, after `<AdminSidebar>` and before `<main>`:

```tsx
  return (
    <div className="flex min-h-screen bg-[#f8f8f6]">
      <AdminSidebar userName={session.user?.name || session.user?.email || "Admin"} />
      <CommandPalette />
      <main className="flex-1 p-6 overflow-auto ml-[220px] transition-all duration-200">{children}</main>
    </div>
  );
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/command-palette.tsx src/app/admin/layout.tsx
git commit -m "feat: add Cmd+K command palette for quick navigation and actions"
```

---

## Task 7: Pipeline Kanban Page

**Files:**
- Create: `src/app/admin/pipeline/page.tsx`
- Create: `src/app/admin/pipeline/pipeline-client.tsx`

- [ ] **Step 1: Create pipeline server page**

Create `src/app/admin/pipeline/page.tsx`:

```tsx
import { getContactsByStage } from "@/actions/contacts";
import { getTeamMembers } from "@/actions/team";
import { PipelineClient } from "./pipeline-client";

export default async function PipelinePage() {
  const [grouped, team] = await Promise.all([getContactsByStage(), getTeamMembers()]);

  // Serialize dates
  const serialized: Record<string, Array<Record<string, unknown>>> = {};
  for (const [stage, contacts] of Object.entries(grouped)) {
    serialized[stage] = contacts.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      tags: c.tags.map((t) => t.tag),
    }));
  }

  return <PipelineClient grouped={serialized} team={team} />;
}
```

- [ ] **Step 2: Create pipeline client component**

Create `src/app/admin/pipeline/pipeline-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateContactStage } from "@/actions/contacts";
import { logActivity } from "@/actions/activities";
import { KANBAN_STAGES, STAGE_COLORS } from "@/lib/contact-helpers";
import { PageHeader } from "@/components/admin/page-header";
import { StageBadge } from "@/components/admin/stage-badge";

interface ContactCard {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  stage: string;
  source: string | null;
  lastAppStep: number | null;
  updatedAt: string;
  assignedRep: { id: string; name: string } | null;
  tags: string[];
}

export function PipelineClient({
  grouped,
  team,
}: {
  grouped: Record<string, ContactCard[]>;
  team: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  async function handleDrop(stage: string) {
    if (!draggingId) return;
    await updateContactStage(draggingId, stage);
    await logActivity({
      contactId: draggingId,
      type: "stage_changed",
      title: `Stage changed to ${stage}`,
      performedBy: "admin",
    });
    setDraggingId(null);
    router.refresh();
  }

  return (
    <div>
      <PageHeader title="Pipeline" description="Drag contacts between stages to update their status" />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_STAGES.map((stage) => {
          const contacts = grouped[stage] || [];
          const colors = STAGE_COLORS[stage];
          return (
            <div
              key={stage}
              className="flex-shrink-0 w-[280px]"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stage)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${colors.bg.replace("bg-", "bg-")} ${colors.text.replace("text-", "bg-")}`} />
                  <span className="text-[12px] font-semibold text-[#1a1a1a] uppercase tracking-[0.04em]">{stage.replace("_", " ")}</span>
                </div>
                <span className="text-[11px] text-[#a1a1aa] bg-[#f4f4f5] rounded-full px-2 py-0.5">{contacts.length}</span>
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[200px] bg-[#f4f4f5]/50 rounded-xl p-2">
                {contacts.map((contact) => (
                  <div
                    key={contact.id}
                    draggable
                    onDragStart={() => setDraggingId(contact.id)}
                    className="bg-white rounded-xl p-3.5 border border-[#e4e4e7] cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow"
                  >
                    <Link href={`/admin/contacts/${contact.id}`} className="block">
                      <p className="text-[13px] font-bold text-[#1a1a1a]">
                        {contact.firstName} {contact.lastName || ""}
                      </p>
                      <p className="text-[11px] text-[#71717a] mt-0.5 truncate">{contact.email}</p>
                      {contact.source && (
                        <p className="text-[10px] text-[#a1a1aa] mt-1">{contact.source}</p>
                      )}
                      {contact.lastAppStep && contact.lastAppStep < 7 && (
                        <p className="text-[10px] text-[#b45309] mt-1">Stopped at step {contact.lastAppStep}/7</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        {contact.assignedRep && (
                          <span className="text-[10px] text-[#71717a]">{contact.assignedRep.name}</span>
                        )}
                        <span className="text-[10px] text-[#a1a1aa]">
                          {new Date(contact.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {contact.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {contact.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="text-[9px] bg-[#f4f4f5] text-[#71717a] rounded-full px-1.5 py-0.5">{tag}</span>
                          ))}
                        </div>
                      )}
                    </Link>
                  </div>
                ))}
                {contacts.length === 0 && (
                  <p className="text-center text-[11px] text-[#a1a1aa] py-8">No contacts</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/pipeline/
git commit -m "feat: add CRM pipeline Kanban board with drag-to-change-stage"
```

---

## Task 8: Contacts List Page

**Files:**
- Create: `src/app/admin/contacts/page.tsx`
- Create: `src/app/admin/contacts/contacts-client.tsx`

- [ ] **Step 1: Create contacts server page**

Create `src/app/admin/contacts/page.tsx`:

```tsx
import { getContacts, getContactMetrics } from "@/actions/contacts";
import { getTeamMembers } from "@/actions/team";
import { ContactsClient } from "./contacts-client";

export default async function ContactsPage() {
  const [{ contacts, total }, metrics, team] = await Promise.all([
    getContacts(),
    getContactMetrics(),
    getTeamMembers(),
  ]);

  return (
    <ContactsClient
      contacts={contacts.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        tags: c.tags.map((t) => t.tag),
      }))}
      total={total}
      metrics={metrics}
      team={team}
    />
  );
}
```

- [ ] **Step 2: Create contacts client component**

Create `src/app/admin/contacts/contacts-client.tsx`. This is the big one — a full data table with search, filter, sort, and pagination. Follow the settings-page visual quality. Include:
- PageHeader "Contacts" with count
- Filter pills for stage (all stages), search input
- Table: Name, Email, Phone, Stage (badge), Source, Rep, Created
- Row click → `/admin/contacts/[id]`
- Pagination at bottom

The implementing agent should create this file using:
- `PageHeader` from `@/components/admin/page-header`
- `StageBadge` from `@/components/admin/stage-badge`
- `PIPELINE_STAGES` from `@/lib/contact-helpers`
- Settings-page styling: white rounded-xl cards, 11px uppercase labels, hover states
- Search uses `useRouter` + query params to re-fetch server-side
- Table with sticky header, row hover `hover:bg-[#f8f8f6]`
- Pagination: "Showing 1-50 of {total}" with prev/next buttons

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/contacts/page.tsx src/app/admin/contacts/contacts-client.tsx
git commit -m "feat: add contacts list page with search, filter, and pagination"
```

---

## Task 9: Contact Detail Page

**Files:**
- Create: `src/app/admin/contacts/[id]/page.tsx`
- Create: `src/app/admin/contacts/[id]/contact-detail-client.tsx`

- [ ] **Step 1: Create contact detail server page**

Create `src/app/admin/contacts/[id]/page.tsx`:

```tsx
import { getContact } from "@/actions/contacts";
import { getTeamMembers } from "@/actions/team";
import { ContactDetailClient } from "./contact-detail-client";
import { notFound } from "next/navigation";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [contact, team] = await Promise.all([getContact(id), getTeamMembers()]);
  if (!contact) notFound();

  return (
    <ContactDetailClient
      contact={{
        ...contact,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
        tags: contact.tags.map((t) => t.tag),
        activities: contact.activities.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
        })),
        application: contact.application ? {
          id: contact.application.id,
          applicationCode: contact.application.applicationCode,
          status: contact.application.status,
          loanAmount: Number(contact.application.loanAmount),
          createdAt: contact.application.createdAt.toISOString(),
        } : null,
      }}
      team={team}
    />
  );
}
```

- [ ] **Step 2: Create contact detail client component**

Create `src/app/admin/contacts/[id]/contact-detail-client.tsx`. Tabbed layout using `TabBar` component:

**Tab: Overview**
- Left column: info card (name, email, phone, source, UTM), editable stage dropdown, assigned rep selector, add/remove tags
- Right column: quick stats (created date, last activity, app step)

**Tab: Activity**
- Chronological timeline with icons per activity type
- "Add Note" textarea + submit at top
- "Log Call" quick button

**Tab: Application**
- If linked: show application code, status, loan amount, link to `/admin/applications/[id]`
- If not linked: "No application submitted yet" with progress indicator showing last step

The implementing agent should use:
- `TabBar` with tabs: Overview, Activity, Application
- `StageBadge` for stage display
- `logActivity` action for adding notes
- `updateContactStage`, `assignContactRep`, `addContactTag`, `removeContactTag` actions
- Settings-page card styling throughout
- `useRouter().refresh()` after mutations

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/contacts/\[id\]/
git commit -m "feat: add contact detail page with tabs (overview, activity, application)"
```

---

## Task 10: Team Management Page

**Files:**
- Create: `src/app/admin/team/page.tsx`
- Create: `src/app/admin/team/team-client.tsx`

- [ ] **Step 1: Create team server page**

Create `src/app/admin/team/page.tsx`:

```tsx
import { getTeamMembers } from "@/actions/team";
import { TeamClient } from "./team-client";

export default async function TeamPage() {
  const members = await getTeamMembers();
  return <TeamClient members={members} />;
}
```

- [ ] **Step 2: Create team client component**

Create `src/app/admin/team/team-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTeamMember, updateTeamMemberRole, deleteTeamMember } from "@/actions/team";
import { PageHeader } from "@/components/admin/page-header";
import { toast } from "sonner";

interface Member {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export function TeamClient({ members }: { members: Member[] }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "REP" });
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!form.email || !form.name || !form.password) return;
    setSaving(true);
    try {
      await createTeamMember(form);
      setShowAdd(false);
      setForm({ email: "", name: "", password: "", role: "REP" });
      toast.success("Team member added");
      router.refresh();
    } catch {
      toast.error("Failed to add member");
    }
    setSaving(false);
  }

  async function handleRoleChange(id: string, role: string) {
    await updateTeamMemberRole(id, role);
    toast.success("Role updated");
    router.refresh();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove ${name} from the team?`)) return;
    await deleteTeamMember(id);
    toast.success("Member removed");
    router.refresh();
  }

  const inputClass = "w-full text-[13px] px-3.5 py-2.5 bg-[#f4f4f5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803d]/20";
  const labelClass = "text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] mb-1.5 block";

  return (
    <div>
      <PageHeader title="Team" description="Manage admin users and sales reps" action={{ label: "Add Member", onClick: () => setShowAdd(true) }} />

      {/* Add member form */}
      {showAdd && (
        <div className="bg-white rounded-xl p-6 mb-6 border border-[#e4e4e7]">
          <h3 className="text-[15px] font-bold text-[#1a1a1a] mb-4">Add Team Member</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Jane Smith" /></div>
            <div><label className={labelClass}>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} placeholder="jane@creditlime.com" type="email" /></div>
            <div><label className={labelClass}>Password</label><input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} type="password" placeholder="Minimum 8 characters" /></div>
            <div><label className={labelClass}>Role</label><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputClass}><option value="ADMIN">Admin</option><option value="REP">Rep</option></select></div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleAdd} disabled={saving} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] disabled:opacity-50">{saving ? "Adding..." : "Add Member"}</button>
            <button onClick={() => setShowAdd(false)} className="text-[13px] text-[#71717a] px-4 py-2.5 rounded-xl hover:bg-[#f4f4f5]">Cancel</button>
          </div>
        </div>
      )}

      {/* Team list */}
      <div className="bg-white rounded-xl overflow-hidden border border-[#e4e4e7]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e4e4e7]">
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Name</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Email</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Role</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Joined</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-[#f4f4f5] last:border-0 hover:bg-[#f8f8f6] transition-colors">
                <td className="px-5 py-3.5 text-[13px] font-medium text-[#1a1a1a]">{m.name}</td>
                <td className="px-5 py-3.5 text-[13px] text-[#71717a]">{m.email}</td>
                <td className="px-5 py-3.5">
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value)}
                    className="text-[12px] font-semibold bg-[#f4f4f5] rounded-lg px-2.5 py-1.5"
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="REP">Rep</option>
                  </select>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-[#a1a1aa]">{new Date(m.createdAt).toLocaleDateString()}</td>
                <td className="px-5 py-3.5 text-right">
                  <button onClick={() => handleDelete(m.id, m.name)} className="text-[12px] text-red-500 hover:text-red-700">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/team/
git commit -m "feat: add team management page (add/edit role/remove members)"
```

---

## Task 11: Hook /apply Form Into Contact Creation

**Files:**
- Modify: `src/app/(public)/apply/page.tsx`

- [ ] **Step 1: Add contact creation on Step 2 completion**

In `src/app/(public)/apply/page.tsx`, import the contact actions:

```typescript
import { upsertContact, updateContactLastStep, linkContactApplication, addContactTag } from "@/actions/contacts";
import { logActivity } from "@/actions/activities";
```

Find the function where the user advances from Step 2 to Step 3 (the `onNext` handler for StepInfo). After the existing validation passes and before `setStep(step + 1)`:

Add a server call:

```typescript
// Create/update contact when user completes Step 2 (has name + email + phone)
try {
  const contact = await upsertContact({
    email: form.email,
    firstName: form.firstName,
    lastName: form.lastName,
    phone: form.phone,
    source: searchParams.get("utm_campaign") ? `lp:${searchParams.get("utm_campaign")}` : "direct",
    utmSource: searchParams.get("utm_source") || undefined,
    utmCampaign: searchParams.get("utm_campaign") || undefined,
    utmMedium: searchParams.get("utm_medium") || undefined,
    lastAppStep: 2,
  });
  await logActivity({ contactId: contact.id, type: "app_started", title: "Application started" });
  // Store contact id for step updates
  sessionStorage.setItem("creditlime_contact_id", contact.id);
} catch {}
```

Find each step transition (Step 3 → 4, 4 → 5, etc.). After each, add:

```typescript
try {
  const cid = sessionStorage.getItem("creditlime_contact_id");
  if (cid) await logActivity({ contactId: cid, type: "app_step_completed", title: `Completed Step ${step + 1}` });
  if (form.email) await updateContactLastStep(form.email, step + 1);
} catch {}
```

Find the final submit handler. After successful submission, add:

```typescript
try {
  if (form.email && applicationCode) {
    await linkContactApplication(form.email, applicationCode);
  }
} catch {}
```

The implementing agent must READ the full apply page first to find the exact step transition handlers and submit handler, then insert the contact calls at the right places. The file is ~1600 lines — search for `setStep` calls and the `submitApplication` call.

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(public\)/apply/page.tsx
git commit -m "feat: hook /apply form into Contact creation (auto-create on Step 2, track progress)"
```

---

## Task 12: Upgraded Dashboard

**Files:**
- Modify: `src/app/admin/dashboard/page.tsx`
- Modify: `src/app/admin/dashboard/dashboard-client.tsx`

- [ ] **Step 1: Update dashboard server page**

Replace `src/app/admin/dashboard/page.tsx` to fetch contact metrics alongside existing data:

```tsx
import { getApplications } from "@/actions/applications";
import { getContactMetrics } from "@/actions/contacts";
import { getRecentActivities } from "@/actions/activities";
import { DashboardClient } from "./dashboard-client";
import type { ApplicationWithDocuments } from "@/types";

export default async function AdminDashboardPage() {
  const [applications, contactMetrics, recentActivities] = await Promise.all([
    getApplications() as Promise<ApplicationWithDocuments[]>,
    getContactMetrics(),
    getRecentActivities(10),
  ]);

  return (
    <DashboardClient
      applications={applications}
      contactMetrics={contactMetrics}
      recentActivities={recentActivities.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        contact: a.contact,
      }))}
    />
  );
}
```

- [ ] **Step 2: Rewrite dashboard client**

The implementing agent should rewrite `src/app/admin/dashboard/dashboard-client.tsx` to use the new `StatCard`, `PageHeader` components and add:

- **Top row (4 StatCards):** Active loans (green), Revenue/outstanding (blue), New leads this week (amber), Conversion rate % (gray). Data comes from `applications` prop (existing) + `contactMetrics` prop (new).
- **Second row:** Conversion funnel — horizontal bar showing LEAD → APPLICANT → APPROVED → FUNDED counts from `contactMetrics.byStage`. Use simple div bars with Tailwind widths. No need for recharts for this.
- **Third row:** Recent activity feed from `recentActivities` — list of activity cards with type icon, title, contact name, relative timestamp.

Use `PageHeader title="Dashboard"` at top.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/dashboard/
git commit -m "feat: upgrade admin dashboard with CRM metrics, funnel, and activity feed"
```

---

## Task 13: Abandoned Apps Page (placeholder)

**Files:**
- Create: `src/app/admin/abandoned/page.tsx`
- Create: `src/app/admin/abandoned/abandoned-client.tsx`

This is a filtered view of contacts. Placeholder for Phase 2 which will add auto-tagging and email triggers.

- [ ] **Step 1: Create abandoned apps server page**

Create `src/app/admin/abandoned/page.tsx`:

```tsx
import { getContacts } from "@/actions/contacts";
import { AbandonedClient } from "./abandoned-client";

export default async function AbandonedPage() {
  const { contacts, total } = await getContacts({ tag: "abandoned-app" });

  return (
    <AbandonedClient
      contacts={contacts.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        lastAppStep: c.lastAppStep,
        source: c.source,
        createdAt: c.createdAt.toISOString(),
        assignedRep: c.assignedRep,
        tags: c.tags.map((t) => t.tag),
      }))}
      total={total}
    />
  );
}
```

- [ ] **Step 2: Create abandoned client component**

Create `src/app/admin/abandoned/abandoned-client.tsx`. A simple table showing:
- Name, email, phone, last step reached (e.g., "Step 4/7: Identity"), source, time since created, assigned rep
- Sort by last step (descending = warmest leads first)
- Use `PageHeader title="Abandoned Applications"` with description showing total count
- Use `EmptyState` when no abandoned contacts

The implementing agent should build this as a standard table page following the contacts list pattern but pre-filtered to only show contacts with the `abandoned-app` tag.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/abandoned/
git commit -m "feat: add abandoned applications page (contacts with abandoned-app tag)"
```

---

## Task 14: Email Marketing Placeholder Page

**Files:**
- Create: `src/app/admin/email/page.tsx`

- [ ] **Step 1: Create email marketing placeholder**

Create `src/app/admin/email/page.tsx`:

```tsx
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";

export default function EmailPage() {
  return (
    <div>
      <PageHeader title="Email Marketing" description="Campaigns, sequences, and templates" />
      <div className="bg-white rounded-xl border border-[#e4e4e7]">
        <EmptyState
          title="Coming soon"
          description="Email marketing with automated sequences, manual campaigns, and a drip builder is coming in Phase 3."
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/email/
git commit -m "feat: add email marketing placeholder page"
```

---

## Task 15: Final Integration & Build Verification

- [ ] **Step 1: Verify all TypeScript**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Fix any build errors.

- [ ] **Step 3: Verify all admin routes load**

Start dev server and visit:
- `/admin/dashboard` — new stat cards + activity feed
- `/admin/pipeline` — Kanban board (empty, but renders)
- `/admin/contacts` — contacts table (empty, but renders)
- `/admin/abandoned` — abandoned table (empty, but renders)
- `/admin/email` — placeholder
- `/admin/team` — team list with existing admin user
- `/admin/settings` — still works
- `/admin/content` — still works

Verify sidebar shows all groups, collapses, Cmd+K opens.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: resolve any remaining build issues for Phase 1 CRM"
```

- [ ] **Step 5: Push to main**

```bash
git push origin main
```
