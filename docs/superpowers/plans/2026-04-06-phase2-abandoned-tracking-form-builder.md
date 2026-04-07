# Phase 2: Abandoned App Auto-Tagging & Form Builder

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-detect and tag abandoned loan applications via a cron job, build a form template system that lets admins create/customize application forms with toggleable steps and custom fields, and link form templates to landing pages.

**Architecture:** New cron route (`/api/cron/abandoned-check`) runs every 5 minutes, tags contacts who haven't progressed in 1 hour. New FormTemplate Prisma model stores configurable form definitions. The /apply page reads a `?template=slug` param and dynamically renders steps based on the template. Landing pages get a `formTemplateSlug` field to link to a template.

**Tech Stack:** Next.js 16, Prisma 7 (SQLite), existing cron pattern (API routes called by Railway cron), existing admin UI components from Phase 1.

**Spec:** `docs/superpowers/specs/2026-04-06-cms-crm-system-design.md` Section 3 (Phase 2)

---

## File Structure

### New Files

```
prisma/
  schema.prisma                                    (MODIFY — add FormTemplate, add formTemplateSlug to LandingPage)

src/
  app/
    api/
      cron/
        abandoned-check/
          route.ts                                 (cron: auto-tag abandoned contacts)

    admin/
      content/
        form-templates/
          page.tsx                                 (server — list form templates)
          form-templates-client.tsx                (client — template list)
          new/
            page.tsx                               (server — new template)
            form-template-editor-client.tsx         (client — full form builder editor)
          [id]/
            page.tsx                               (server — edit template)

  actions/
    form-templates.ts                              (server actions: CRUD for form templates)

  components/
    apply/
      dynamic-step.tsx                             (renders a custom step from FormField definitions)

  types/
    form-template.ts                               (TypeScript types for form steps/fields)
```

### Modified Files

```
prisma/schema.prisma                               (add FormTemplate model, add formTemplateSlug to LandingPage)
src/app/(public)/apply/page.tsx                    (read template param, render dynamic steps)
src/app/admin/content/content-dashboard-client.tsx  (add Form Templates tile)
src/app/admin/content/page.tsx                     (fetch form template count)
src/app/admin/content/landing-pages/new/landing-page-editor-client.tsx  (add formTemplateSlug field)
src/app/admin/abandoned/abandoned-client.tsx        (add stats row at top)
src/app/admin/abandoned/page.tsx                   (fetch stats)
src/middleware.ts                                  (already covers /admin/content/*)
```

---

## Task 1: Prisma Schema — FormTemplate + LandingPage.formTemplateSlug

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/types/form-template.ts`

- [ ] **Step 1: Add FormTemplate model to schema**

Append after the Activity model in `prisma/schema.prisma`:

```prisma
model FormTemplate {
  id          String   @id @default(uuid())
  name        String   @unique
  slug        String   @unique
  description String?
  steps       String   @default("[]")
  isDefault   Boolean  @default(false)
  published   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([slug])
}
```

- [ ] **Step 2: Add formTemplateSlug to LandingPage model**

Find the LandingPage model. Add before the `published` field:

```prisma
  formTemplateSlug String?
```

- [ ] **Step 3: Create TypeScript types**

Create `src/types/form-template.ts`:

```typescript
export interface FormField {
  id: string;
  label: string;
  type: "text" | "number" | "select" | "file" | "checkbox" | "textarea";
  placeholder?: string;
  required: boolean;
  options?: string[];
  order: number;
}

export interface FormStep {
  id: string;
  title: string;
  description: string;
  order: number;
  enabled: boolean;
  type: "builtin" | "custom";
  builtinKey?: "amount" | "info" | "platforms" | "identity" | "bank" | "documents" | "review";
  customFields?: FormField[];
}

export const DEFAULT_STEPS: FormStep[] = [
  { id: "step-amount", title: "Loan Amount", description: "Choose your loan amount and repayment term", order: 0, enabled: true, type: "builtin", builtinKey: "amount" },
  { id: "step-info", title: "Your Info", description: "Tell us about yourself", order: 1, enabled: true, type: "builtin", builtinKey: "info" },
  { id: "step-platforms", title: "Platforms", description: "Select your gig platforms", order: 2, enabled: true, type: "builtin", builtinKey: "platforms" },
  { id: "step-identity", title: "Identity", description: "Upload your photo ID", order: 3, enabled: true, type: "builtin", builtinKey: "identity" },
  { id: "step-bank", title: "Bank Link", description: "Connect your bank account", order: 4, enabled: true, type: "builtin", builtinKey: "bank" },
  { id: "step-documents", title: "Documents", description: "Upload supporting documents", order: 5, enabled: true, type: "builtin", builtinKey: "documents" },
  { id: "step-review", title: "Review", description: "Review and submit your application", order: 6, enabled: true, type: "builtin", builtinKey: "review" },
];
```

- [ ] **Step 4: Run migration**

```bash
cd /Users/baralezrah/loan-portal/.worktrees/crm-phase2
npx prisma migrate dev --name add_form_template
```

- [ ] **Step 5: Commit**

```bash
git add prisma/ src/types/form-template.ts
git commit -m "feat: add FormTemplate model and form step types"
```

---

## Task 2: Abandoned App Auto-Tagging Cron

**Files:**
- Create: `src/app/api/cron/abandoned-check/route.ts`

- [ ] **Step 1: Create the cron route**

Create `src/app/api/cron/abandoned-check/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Runs every 5 minutes via Railway cron
// Tags contacts as "abandoned-app" if they:
// 1. Have stage "LEAD" 
// 2. Have lastAppStep >= 1 and < 7 (started but didn't finish)
// 3. Haven't been updated in the last hour
// 4. Don't already have the "abandoned-app" tag

export async function GET(request: Request) {
  // Optional: verify cron auth
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  try {
    // Find contacts who started but didn't finish, inactive for 1h+
    const staleContacts = await prisma.contact.findMany({
      where: {
        stage: "LEAD",
        lastAppStep: { gte: 1, lt: 7 },
        updatedAt: { lt: oneHourAgo },
        tags: { none: { tag: "abandoned-app" } },
      },
      select: { id: true, firstName: true, email: true, lastAppStep: true },
    });

    let tagged = 0;
    for (const contact of staleContacts) {
      // Add abandoned-app tag
      await prisma.contactTag.upsert({
        where: { contactId_tag: { contactId: contact.id, tag: "abandoned-app" } },
        update: {},
        create: { contactId: contact.id, tag: "abandoned-app" },
      });

      // Log activity
      await prisma.activity.create({
        data: {
          contactId: contact.id,
          type: "tag_added",
          title: `Auto-tagged as abandoned (stopped at step ${contact.lastAppStep}/7)`,
          performedBy: "system",
        },
      });

      tagged++;
    }

    return NextResponse.json({
      ok: true,
      checked: staleContacts.length,
      tagged,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Abandoned check error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | grep abandoned || echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/abandoned-check/
git commit -m "feat: add cron route to auto-tag abandoned applications after 1h inactivity"
```

---

## Task 3: Upgrade Abandoned Apps Admin Page

**Files:**
- Modify: `src/app/admin/abandoned/page.tsx`
- Modify: `src/app/admin/abandoned/abandoned-client.tsx`

- [ ] **Step 1: Update server page to fetch stats**

Read and update `src/app/admin/abandoned/page.tsx` to also fetch summary stats:

```tsx
import { getContacts } from "@/actions/contacts";
import { prisma } from "@/lib/db";
import { AbandonedClient } from "./abandoned-client";

export default async function AbandonedPage() {
  const { contacts, total } = await getContacts({ tag: "abandoned-app" });

  // Compute step dropout stats
  const stepCounts: Record<number, number> = {};
  for (const c of contacts) {
    const step = c.lastAppStep || 0;
    stepCounts[step] = (stepCounts[step] || 0) + 1;
  }

  // This week's count
  const thisWeek = contacts.filter(
    (c) => c.createdAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  ).length;

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
        updatedAt: c.updatedAt.toISOString(),
        assignedRep: c.assignedRep,
        tags: c.tags.map((t) => t.tag),
      }))}
      total={total}
      stats={{ thisWeek, stepCounts, total }}
    />
  );
}
```

- [ ] **Step 2: Add stats row to abandoned client**

Read and modify `src/app/admin/abandoned/abandoned-client.tsx`. Add a stats row at the top of the page (below PageHeader) showing 4 StatCards:
- Total Abandoned (total count, red)
- This Week (thisWeek count, amber)
- Top Dropout Step (step with highest count, gray)
- Recovery Rate (placeholder "0%" for now since we don't track recoveries yet, green)

Add the `stats` prop to the component interface:

```typescript
interface Props {
  contacts: ContactItem[];
  total: number;
  stats: {
    thisWeek: number;
    stepCounts: Record<number, number>;
    total: number;
  };
}
```

Import `StatCard` from `@/components/admin/stat-card`.

Add before the table:

```tsx
<div className="grid grid-cols-4 gap-4 mb-6">
  <StatCard label="Total Abandoned" value={stats.total} color="red" />
  <StatCard label="This Week" value={stats.thisWeek} color="amber" />
  <StatCard
    label="Top Dropout Step"
    value={topStep ? `Step ${topStep}` : "N/A"}
    color="gray"
  />
  <StatCard label="Recovery Rate" value="0%" color="green" />
</div>
```

Where `topStep` is computed from `stats.stepCounts`:

```typescript
const topStep = Object.entries(stats.stepCounts).sort(([,a], [,b]) => b - a)[0]?.[0];
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/abandoned/
git commit -m "feat: add stats cards to abandoned apps page (total, this week, top dropout step)"
```

---

## Task 4: Form Template Server Actions

**Files:**
- Create: `src/actions/form-templates.ts`

- [ ] **Step 1: Create form template actions**

Create `src/actions/form-templates.ts`:

```typescript
"use server";

import { prisma } from "@/lib/db";

export async function getFormTemplates() {
  return prisma.formTemplate.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getFormTemplate(id: string) {
  return prisma.formTemplate.findUnique({ where: { id } });
}

export async function getFormTemplateBySlug(slug: string) {
  return prisma.formTemplate.findUnique({ where: { slug } });
}

export async function getDefaultFormTemplate() {
  return prisma.formTemplate.findFirst({ where: { isDefault: true } });
}

export async function createFormTemplate(data: {
  name: string;
  slug: string;
  description?: string;
  steps: string;
  isDefault?: boolean;
  published?: boolean;
}) {
  // If setting as default, unset any existing default
  if (data.isDefault) {
    await prisma.formTemplate.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }
  return prisma.formTemplate.create({ data });
}

export async function updateFormTemplate(
  id: string,
  data: {
    name?: string;
    slug?: string;
    description?: string;
    steps?: string;
    isDefault?: boolean;
    published?: boolean;
  }
) {
  if (data.isDefault) {
    await prisma.formTemplate.updateMany({
      where: { isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }
  return prisma.formTemplate.update({ where: { id }, data });
}

export async function deleteFormTemplate(id: string) {
  return prisma.formTemplate.delete({ where: { id } });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/form-templates.ts
git commit -m "feat: add FormTemplate server actions (CRUD)"
```

---

## Task 5: Form Template Admin — List Page

**Files:**
- Create: `src/app/admin/content/form-templates/page.tsx`
- Create: `src/app/admin/content/form-templates/form-templates-client.tsx`

- [ ] **Step 1: Create list server page**

Create `src/app/admin/content/form-templates/page.tsx`:

```tsx
import { getFormTemplates } from "@/actions/form-templates";
import { FormTemplatesClient } from "./form-templates-client";

export default async function FormTemplatesPage() {
  const templates = await getFormTemplates();
  return (
    <FormTemplatesClient
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        isDefault: t.isDefault,
        published: t.published,
        stepCount: JSON.parse(t.steps).filter((s: { enabled: boolean }) => s.enabled).length,
        updatedAt: t.updatedAt.toISOString(),
      }))}
    />
  );
}
```

- [ ] **Step 2: Create list client component**

Create `src/app/admin/content/form-templates/form-templates-client.tsx`:

```tsx
"use client";

import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";

interface TemplateItem {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  published: boolean;
  stepCount: number;
  updatedAt: string;
}

export function FormTemplatesClient({ templates }: { templates: TemplateItem[] }) {
  return (
    <div>
      <PageHeader
        title="Form Templates"
        description="Customize application forms for different campaigns"
        action={{ label: "New Template", href: "/admin/content/form-templates/new" }}
      />

      <div className="bg-white rounded-xl overflow-hidden border border-[#e4e4e7]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e4e4e7]">
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Name</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Steps</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Status</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-[#f4f4f5] last:border-0 hover:bg-[#f8f8f6] transition-colors">
                <td className="px-5 py-3.5">
                  <Link href={`/admin/content/form-templates/${t.id}`} className="text-[13px] font-medium text-[#1a1a1a] hover:text-[#15803d]">
                    {t.name}
                    {t.isDefault && <span className="ml-2 text-[10px] bg-[#f0f5f0] text-[#15803d] px-1.5 py-0.5 rounded-full">Default</span>}
                  </Link>
                  <p className="text-[11px] text-[#a1a1aa]">Slug: {t.slug}</p>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-[#71717a]">{t.stepCount} active steps</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold ${t.published ? "bg-[#f0f5f0] text-[#15803d]" : "bg-[#f4f4f5] text-[#71717a]"}`}>
                    {t.published ? "Published" : "Draft"}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-[#a1a1aa]">{new Date(t.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {templates.length === 0 && (
          <div className="text-center py-12 text-[14px] text-[#71717a]">
            No form templates yet. Create one to customize your application flow.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/content/form-templates/page.tsx src/app/admin/content/form-templates/form-templates-client.tsx
git commit -m "feat: add form templates list page in admin"
```

---

## Task 6: Form Template Editor

The core feature — a visual editor for customizing application form steps.

**Files:**
- Create: `src/app/admin/content/form-templates/new/page.tsx`
- Create: `src/app/admin/content/form-templates/new/form-template-editor-client.tsx`
- Create: `src/app/admin/content/form-templates/[id]/page.tsx`

- [ ] **Step 1: Create editor client component**

Create `src/app/admin/content/form-templates/new/form-template-editor-client.tsx`:

This is the biggest file. The editor should have:

**Layout:** Two columns — left is the step list (reorderable), right is the detail editor for the selected step.

**Left column — Step list:**
- Each step shown as a card with: drag handle, step title, enabled toggle switch, order number
- "Add Custom Step" button at bottom
- Steps are reorderable by drag (use simple state-based reorder with up/down arrows if drag is complex)
- Builtin steps show their `builtinKey` as a gray label. Custom steps show "Custom" label.

**Right column — Step detail (when a step is selected):**
- For builtin steps: title (editable), description (editable), enabled toggle. That's it — the form fields are hardcoded.
- For custom steps: title, description, enabled toggle, PLUS a fields builder:
  - List of fields, each with: label, type dropdown (text/number/select/file/checkbox/textarea), placeholder, required toggle, options (for select type, comma-separated)
  - "Add Field" button
  - Remove field button per field
  - Fields are reorderable with up/down arrows

**Sidebar (right):**
- Name input
- Slug input (auto-generated from name)
- Description textarea
- "Default template" checkbox
- Published toggle
- Save button
- Delete button (for edit mode)
- Preview link → `/apply?template={slug}`

**Form data structure:**
```typescript
interface FormData {
  id?: string;
  name: string;
  slug: string;
  description: string;
  steps: FormStep[];
  isDefault: boolean;
  published: boolean;
}
```

On save: serialize `steps` to JSON string, call `createFormTemplate` or `updateFormTemplate`.

The implementing agent should use:
- `PageHeader` from `@/components/admin/page-header`
- `FormStep`, `FormField`, `DEFAULT_STEPS` from `@/types/form-template`
- `createFormTemplate`, `updateFormTemplate`, `deleteFormTemplate` from `@/actions/form-templates`
- `slugify` from `@/lib/content-helpers`
- `toast` from `sonner`
- `useRouter` for navigation after save
- Settings-quality styling: white rounded-xl cards, 11px uppercase labels, green accents, `bg-[#f4f4f5]` inputs

- [ ] **Step 2: Create new page server component**

Create `src/app/admin/content/form-templates/new/page.tsx`:

```tsx
import { FormTemplateEditorClient } from "./form-template-editor-client";

export default function NewFormTemplatePage() {
  return <FormTemplateEditorClient />;
}
```

- [ ] **Step 3: Create edit page server component**

Create `src/app/admin/content/form-templates/[id]/page.tsx`:

```tsx
import { getFormTemplate } from "@/actions/form-templates";
import { FormTemplateEditorClient } from "../new/form-template-editor-client";
import { notFound } from "next/navigation";
import type { FormStep } from "@/types/form-template";

export default async function EditFormTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = await getFormTemplate(id);
  if (!template) notFound();

  return (
    <FormTemplateEditorClient
      template={{
        id: template.id,
        name: template.name,
        slug: template.slug,
        description: template.description || "",
        steps: JSON.parse(template.steps) as FormStep[],
        isDefault: template.isDefault,
        published: template.published,
      }}
    />
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/content/form-templates/
git commit -m "feat: add form template editor with step builder and custom fields"
```

---

## Task 7: Seed Default Form Template

**Files:**
- Create: `scripts/seed-form-templates.ts`
- Modify: `package.json` (add to build)

- [ ] **Step 1: Create seed script**

Create `scripts/seed-form-templates.ts`:

```typescript
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const DEFAULT_STEPS = [
  { id: "step-amount", title: "Loan Amount", description: "Choose your loan amount and repayment term", order: 0, enabled: true, type: "builtin", builtinKey: "amount" },
  { id: "step-info", title: "Your Info", description: "Tell us about yourself", order: 1, enabled: true, type: "builtin", builtinKey: "info" },
  { id: "step-platforms", title: "Platforms", description: "Select your gig platforms", order: 2, enabled: true, type: "builtin", builtinKey: "platforms" },
  { id: "step-identity", title: "Identity", description: "Upload your photo ID", order: 3, enabled: true, type: "builtin", builtinKey: "identity" },
  { id: "step-bank", title: "Bank Link", description: "Connect your bank account", order: 4, enabled: true, type: "builtin", builtinKey: "bank" },
  { id: "step-documents", title: "Documents", description: "Upload supporting documents", order: 5, enabled: true, type: "builtin", builtinKey: "documents" },
  { id: "step-review", title: "Review", description: "Review and submit your application", order: 6, enabled: true, type: "builtin", builtinKey: "review" },
];

async function main() {
  console.log("Seeding form templates...");

  const existing = await prisma.formTemplate.findFirst({ where: { slug: "default" } });
  if (existing && process.env.SEED_FORCE !== "true") {
    console.log("Default form template already exists. Skipping.");
    await prisma.$disconnect();
    return;
  }

  if (existing) {
    await prisma.formTemplate.delete({ where: { id: existing.id } });
  }

  await prisma.formTemplate.create({
    data: {
      name: "Default Application",
      slug: "default",
      description: "The standard 7-step loan application form",
      steps: JSON.stringify(DEFAULT_STEPS),
      isDefault: true,
      published: true,
    },
  });

  // Also create an Uber/Lyft short form (skips platforms step since we know)
  const uberSteps = DEFAULT_STEPS.map((s) => ({
    ...s,
    enabled: s.builtinKey !== "platforms", // skip platforms for Uber/Lyft specific LP
  }));

  const existingUber = await prisma.formTemplate.findFirst({ where: { slug: "uber-lyft-short" } });
  if (!existingUber) {
    await prisma.formTemplate.create({
      data: {
        name: "Uber/Lyft Short Form",
        slug: "uber-lyft-short",
        description: "Shorter form for Uber/Lyft drivers (skips platform selection)",
        steps: JSON.stringify(uberSteps),
        isDefault: false,
        published: true,
      },
    });
  }

  console.log("Form templates seeded.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
```

- [ ] **Step 2: Add to build pipeline**

In `package.json`, update the build script. Find the current build line and add `&& npx tsx scripts/seed-form-templates.ts` before `&& next build`.

- [ ] **Step 3: Run the seed**

```bash
npx tsx scripts/seed-form-templates.ts
```

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-form-templates.ts package.json
git commit -m "feat: seed default and Uber/Lyft short form templates"
```

---

## Task 8: Dynamic /apply With Template Support

**Files:**
- Modify: `src/app/(public)/apply/page.tsx`
- Create: `src/components/apply/dynamic-step.tsx`

This is the most complex task. The /apply page needs to:
1. Read `?template=slug` from URL params
2. Fetch the FormTemplate by slug (or use default)
3. Filter to only enabled steps, sorted by order
4. Render builtin steps using existing hardcoded components
5. Render custom steps using a dynamic field renderer

- [ ] **Step 1: Create dynamic step renderer**

Create `src/components/apply/dynamic-step.tsx`:

```tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { FormField } from "@/types/form-template";

interface DynamicStepProps {
  title: string;
  description: string;
  fields: FormField[];
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function DynamicStep({ title, description, fields, values, onChange, onNext, onBack }: DynamicStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const errs: Record<string, string> = {};
    for (const field of fields) {
      if (field.required && !values[field.id]?.trim()) {
        errs[field.id] = `${field.label} is required`;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (validate()) onNext();
  }

  const sortedFields = [...fields].sort((a, b) => a.order - b.order);

  const inputClass = "w-full text-[14px] px-4 py-3 bg-[#f4f4f5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803d]/20";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col w-full max-w-[400px] mx-auto"
    >
      <h2 className="text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">{title}</h2>
      <p className="mt-2 text-sm text-[#71717a]">{description}</p>

      <div className="mt-8 space-y-4">
        {sortedFields.map((field) => (
          <div key={field.id}>
            <label className="text-[13px] font-semibold text-[#1a1a1a] mb-1.5 block">{field.label}{field.required && " *"}</label>
            {field.type === "text" && (
              <input type="text" value={values[field.id] || ""} onChange={(e) => onChange(field.id, e.target.value)} placeholder={field.placeholder} className={inputClass} />
            )}
            {field.type === "number" && (
              <input type="number" value={values[field.id] || ""} onChange={(e) => onChange(field.id, e.target.value)} placeholder={field.placeholder} className={inputClass} />
            )}
            {field.type === "textarea" && (
              <textarea value={values[field.id] || ""} onChange={(e) => onChange(field.id, e.target.value)} placeholder={field.placeholder} rows={3} className={inputClass} />
            )}
            {field.type === "select" && (
              <select value={values[field.id] || ""} onChange={(e) => onChange(field.id, e.target.value)} className={inputClass}>
                <option value="">Select...</option>
                {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            )}
            {field.type === "checkbox" && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={values[field.id] === "true"} onChange={(e) => onChange(field.id, String(e.target.checked))} className="rounded" />
                <span className="text-[13px] text-[#71717a]">{field.placeholder || field.label}</span>
              </label>
            )}
            {field.type === "file" && (
              <input type="file" onChange={(e) => onChange(field.id, e.target.files?.[0]?.name || "")} className="text-[13px] text-[#71717a]" />
            )}
            {errors[field.id] && <p className="text-[12px] text-red-500 mt-1">{errors[field.id]}</p>}
          </div>
        ))}
      </div>

      <div className="mt-8 flex gap-3">
        <button onClick={onBack} className="flex-1 py-3 rounded-xl text-[14px] font-semibold text-[#71717a] bg-[#f4f4f5] hover:bg-[#e5e7eb] transition-colors">
          Back
        </button>
        <button onClick={handleNext} className="flex-1 py-3 rounded-xl text-[14px] font-semibold text-white bg-[#15803d] hover:bg-[#166534] transition-colors">
          Continue
        </button>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Modify /apply to support templates**

This is complex. The implementing agent should:

1. Read the ENTIRE `src/app/(public)/apply/page.tsx`
2. In `ApplyPageInner`, add state for the form template:
   ```typescript
   const [formTemplate, setFormTemplate] = useState<FormStep[] | null>(null);
   ```
3. Add a `useEffect` that fetches the template on mount:
   ```typescript
   useEffect(() => {
     const templateSlug = searchParams.get("template");
     if (templateSlug) {
       fetch(`/api/form-template?slug=${templateSlug}`)
         .then(r => r.json())
         .then(t => {
           if (t?.steps) setFormTemplate(JSON.parse(t.steps));
         })
         .catch(() => {});
     }
   }, []);
   ```
4. Create a simple API route `src/app/api/form-template/route.ts`:
   ```typescript
   import { NextRequest, NextResponse } from "next/server";
   import { getFormTemplateBySlug } from "@/actions/form-templates";
   
   export async function GET(request: NextRequest) {
     const slug = request.nextUrl.searchParams.get("slug");
     if (!slug) return NextResponse.json(null);
     const template = await getFormTemplateBySlug(slug);
     return NextResponse.json(template);
   }
   ```
5. Modify the step rendering logic: if `formTemplate` is loaded, filter to enabled steps. The STEPS constant (used for the stepper header) should be dynamically generated from the template. For builtin steps, render the existing components. For custom steps, render `<DynamicStep>`.

The key change: instead of hardcoded `STEPS` array controlling the flow, derive the active steps from the template:

```typescript
const activeSteps = formTemplate 
  ? formTemplate.filter(s => s.enabled).sort((a, b) => a.order - b.order)
  : DEFAULT_STEPS.filter(s => s.enabled);
```

And the step header labels become `activeSteps.map(s => s.title)` instead of the hardcoded STEPS array.

For rendering: map `activeSteps[step]` to the corresponding builtin component based on `builtinKey`, or `<DynamicStep>` for custom steps.

This is a significant refactor of the apply page's step logic. The implementing agent should be careful to preserve all existing functionality while adding the template layer on top.

- [ ] **Step 3: Commit**

```bash
git add src/components/apply/dynamic-step.tsx src/app/api/form-template/ src/app/\(public\)/apply/page.tsx
git commit -m "feat: add template-driven /apply form with dynamic step rendering"
```

---

## Task 9: Link Landing Pages to Form Templates

**Files:**
- Modify: `src/app/admin/content/landing-pages/new/landing-page-editor-client.tsx`
- Modify: `src/components/landing/landing-lead-form.tsx`
- Modify: `src/app/lp/[slug]/page.tsx`

- [ ] **Step 1: Add formTemplateSlug field to LP editor**

Read `src/app/admin/content/landing-pages/new/landing-page-editor-client.tsx`. In the "Form Config" section of the editor, add a `formTemplateSlug` text input:

```tsx
<div>
  <label className={labelClass}>Form Template Slug (optional)</label>
  <input
    value={form.formTemplateSlug}
    onChange={(e) => updateField("formTemplateSlug", e.target.value)}
    className={inputClass}
    placeholder="e.g. uber-lyft-short (leave empty for default)"
  />
  <p className="text-[11px] text-[#a1a1aa] mt-1">Links to a form template. Applicants will use this form variant.</p>
</div>
```

Add `formTemplateSlug` to the form state interface and initial state.

- [ ] **Step 2: Pass template slug through the form**

Read `src/components/landing/landing-lead-form.tsx`. Add `formTemplateSlug?: string` to the Props interface. In the `handleStart` function, add it to the URL params if present:

```typescript
if (props.formTemplateSlug) {
  params.set("template", props.formTemplateSlug);
}
```

- [ ] **Step 3: Pass it from the LP page**

Read `src/app/lp/[slug]/page.tsx`. When rendering `<LandingLeadForm>`, pass the `formTemplateSlug` prop from the landing page data.

- [ ] **Step 4: Update LP seed to include formTemplateSlug**

Read `scripts/seed-landing-pages.ts`. Add `formTemplateSlug: "uber-lyft-short"` to the uber-lyft-driver-loans seed data (so Uber/Lyft LP uses the short form that skips the platforms step).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/content/landing-pages/ src/components/landing/ src/app/lp/ scripts/seed-landing-pages.ts
git commit -m "feat: link landing pages to form templates for customized application flows"
```

---

## Task 10: Update Content Dashboard

**Files:**
- Modify: `src/app/admin/content/page.tsx`
- Modify: `src/app/admin/content/content-dashboard-client.tsx`

- [ ] **Step 1: Add form templates to dashboard**

Read and modify `src/app/admin/content/page.tsx`. Import `getFormTemplates` from `@/actions/form-templates`. Fetch in parallel with other content types. Add `formTemplates: formTemplates.length` to the counts object.

Read and modify `src/app/admin/content/content-dashboard-client.tsx`. Add "Form Templates" to the `contentTypes` array:

```typescript
{ label: "Form Templates", href: "/admin/content/form-templates", key: "formTemplates" as const },
```

Update the counts type to include `formTemplates: number`.

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/content/page.tsx src/app/admin/content/content-dashboard-client.tsx
git commit -m "feat: add form templates tile to content dashboard"
```

---

## Task 11: Final Verification & Push

- [ ] **Step 1: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Run seed scripts**

```bash
npx tsx scripts/seed-form-templates.ts
```

- [ ] **Step 4: Test key URLs**

```
/admin/content/form-templates — list page shows 2 templates
/admin/content/form-templates/new — editor renders
/admin/abandoned — stats cards at top
/api/cron/abandoned-check — returns JSON with ok:true
/apply?template=uber-lyft-short — loads and skips platforms step
```

- [ ] **Step 5: Fix any issues and commit**

```bash
git add -A
git commit -m "fix: resolve build issues for Phase 2"
```

- [ ] **Step 6: Push**

```bash
git push origin main
```
