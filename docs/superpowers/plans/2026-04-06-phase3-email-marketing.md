# Phase 3: Email Marketing System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build email marketing with automated sequences (abandoned app recovery, lifecycle emails), manual campaigns with segment builder, drip sequence builder, email templates library, and Resend webhook tracking.

**Architecture:** New Prisma models (EmailTemplate, EmailCampaign, EmailSequence, SequenceEnrollment, EmailEvent). Automated sequences trigger via the existing abandoned-check cron. A new cron route processes scheduled sends and sequence steps every 5 minutes. Resend webhook endpoint tracks delivery/opens/clicks. All emails sent via existing Resend SDK. Admin UI for campaigns, sequences, and templates under `/admin/email/`.

**Tech Stack:** Next.js 16, Prisma 7, Resend (already installed), Tiptap (already installed for rich text), existing admin UI components from Phase 1.

**Spec:** `docs/superpowers/specs/2026-04-06-cms-crm-system-design.md` Section 4 (Phase 3)

---

## File Structure

### New Files

```
prisma/
  schema.prisma                                    (MODIFY — add 4 email models)

src/
  actions/
    email.ts                                       (server actions: templates, campaigns, sequences, enrollments, events)

  lib/
    email-sender.ts                                (send email via Resend with tracking, shared by campaigns + sequences)
    segment-resolver.ts                            (resolve audience from SegmentRule[] to Contact[])

  app/
    api/
      email/
        webhook/
          route.ts                                 (Resend webhook: delivered/opened/clicked/bounced)
      cron/
        email-processor/
          route.ts                                 (cron: process sequence steps + scheduled campaigns)

    admin/
      email/
        page.tsx                                   (REPLACE placeholder — email dashboard)
        email-dashboard-client.tsx                 (client — stats, quick links)
        campaigns/
          page.tsx                                 (server — campaigns list)
          campaigns-client.tsx                     (client — campaigns table)
          new/
            page.tsx                               (server — new campaign)
            campaign-editor-client.tsx             (client — subject, body, segment builder, schedule)
          [id]/
            page.tsx                               (server — edit/view campaign)
        sequences/
          page.tsx                                 (server — sequences list)
          sequences-client.tsx                     (client — sequences table)
          new/
            page.tsx                               (server — new sequence)
            sequence-editor-client.tsx             (client — trigger, steps with delays)
          [id]/
            page.tsx                               (server — edit sequence)
        templates/
          page.tsx                                 (server — templates list)
          templates-client.tsx                     (client — templates table)
          new/
            page.tsx                               (server — new template)
            template-editor-client.tsx             (client — Tiptap editor for email HTML)
          [id]/
            page.tsx                               (server — edit template)

  types/
    email.ts                                       (TypeScript types for segments, sequence steps)

scripts/
  seed-email-sequences.ts                          (seed default automated sequences)
```

### Modified Files

```
prisma/schema.prisma                               (add EmailTemplate, EmailCampaign, EmailSequence, SequenceEnrollment, EmailEvent)
src/app/admin/email/page.tsx                       (replace placeholder with dashboard)
src/app/api/cron/abandoned-check/route.ts          (add auto-enrollment into abandoned sequence)
src/components/admin/sidebar.tsx                   (expand EMAIL group with sub-items)
package.json                                       (add seed script to build)
```

---

## Task 1: Prisma Schema — Email Models

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/types/email.ts`

- [ ] **Step 1: Add email models to schema**

Append after FormTemplate model:

```prisma
// ─── Email Marketing ─────────────────────────────────────────

model EmailTemplate {
  id        String   @id @default(uuid())
  name      String
  subject   String
  body      String
  category  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model EmailCampaign {
  id            String    @id @default(uuid())
  name          String
  subject       String
  body          String
  templateId    String?
  segmentRules  String    @default("[]")
  audienceCount Int       @default(0)
  status        String    @default("DRAFT")
  scheduledAt   DateTime?
  sentAt        DateTime?
  totalSent     Int       @default(0)
  totalOpened   Int       @default(0)
  totalClicked  Int       @default(0)
  createdBy     String
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([status])
}

model EmailSequence {
  id           String   @id @default(uuid())
  name         String
  description  String?
  steps        String   @default("[]")
  triggerType  String
  triggerValue String?
  active       Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model SequenceEnrollment {
  id          String    @id @default(uuid())
  contactId   String
  sequenceId  String
  currentStep Int       @default(0)
  status      String    @default("ACTIVE")
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
  type       String
  subject    String?
  messageId  String?
  contact    Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())

  @@index([contactId])
  @@index([campaignId])
  @@index([type])
}
```

- [ ] **Step 2: Add relations to Contact model**

In the Contact model, add two new relation fields (before the closing `}`):

```prisma
  emailEvents         EmailEvent[]
  sequenceEnrollments SequenceEnrollment[]
```

- [ ] **Step 3: Create email types**

Create `src/types/email.ts`:

```typescript
export interface SegmentRule {
  field: "stage" | "tag" | "source" | "utmCampaign" | "assignedRepId" | "lastAppStep" | "createdAt";
  operator: "is" | "is_not" | "contains" | "gt" | "lt";
  value: string;
}

export interface SequenceStep {
  id: string;
  order: number;
  subject: string;
  body: string;
  delayAmount: number;
  delayUnit: "hours" | "days";
}
```

- [ ] **Step 4: Run migration**

```bash
npx prisma migrate dev --name add_email_models
```

- [ ] **Step 5: Commit**

```bash
git add prisma/ src/types/email.ts
git commit -m "feat: add email marketing Prisma models (Template, Campaign, Sequence, Enrollment, Event)"
```

---

## Task 2: Email Server Actions

**Files:**
- Create: `src/actions/email.ts`

- [ ] **Step 1: Create email server actions**

Create `src/actions/email.ts` with CRUD for all 4 email entities:

```typescript
"use server";

import { prisma } from "@/lib/db";

// ─── Templates ──────────────────────────────────────────────

export async function getEmailTemplates() {
  return prisma.emailTemplate.findMany({ orderBy: { updatedAt: "desc" } });
}

export async function getEmailTemplate(id: string) {
  return prisma.emailTemplate.findUnique({ where: { id } });
}

export async function createEmailTemplate(data: { name: string; subject: string; body: string; category?: string }) {
  return prisma.emailTemplate.create({ data });
}

export async function updateEmailTemplate(id: string, data: { name?: string; subject?: string; body?: string; category?: string }) {
  return prisma.emailTemplate.update({ where: { id }, data });
}

export async function deleteEmailTemplate(id: string) {
  return prisma.emailTemplate.delete({ where: { id } });
}

// ─── Campaigns ──────────────────────────────────────────────

export async function getEmailCampaigns() {
  return prisma.emailCampaign.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getEmailCampaign(id: string) {
  return prisma.emailCampaign.findUnique({ where: { id } });
}

export async function createEmailCampaign(data: {
  name: string;
  subject: string;
  body: string;
  segmentRules: string;
  createdBy: string;
  scheduledAt?: string;
}) {
  return prisma.emailCampaign.create({
    data: {
      ...data,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
    },
  });
}

export async function updateEmailCampaign(id: string, data: Record<string, unknown>) {
  const { scheduledAt, ...rest } = data as Record<string, unknown> & { scheduledAt?: string };
  const updateData = { ...rest } as Record<string, unknown>;
  if (scheduledAt !== undefined) {
    updateData.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
  }
  return prisma.emailCampaign.update({ where: { id }, data: updateData as never });
}

export async function deleteEmailCampaign(id: string) {
  return prisma.emailCampaign.delete({ where: { id } });
}

// ─── Sequences ──────────────────────────────────────────────

export async function getEmailSequences() {
  return prisma.emailSequence.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getEmailSequence(id: string) {
  return prisma.emailSequence.findUnique({ where: { id } });
}

export async function createEmailSequence(data: {
  name: string;
  description?: string;
  steps: string;
  triggerType: string;
  triggerValue?: string;
  active?: boolean;
}) {
  return prisma.emailSequence.create({ data });
}

export async function updateEmailSequence(id: string, data: Record<string, unknown>) {
  return prisma.emailSequence.update({ where: { id }, data: data as never });
}

export async function deleteEmailSequence(id: string) {
  await prisma.sequenceEnrollment.deleteMany({ where: { sequenceId: id } });
  return prisma.emailSequence.delete({ where: { id } });
}

// ─── Enrollments ────────────────────────────────────────────

export async function enrollContact(contactId: string, sequenceId: string, firstSendAt: Date) {
  return prisma.sequenceEnrollment.upsert({
    where: { contactId_sequenceId: { contactId, sequenceId } },
    update: { status: "ACTIVE", currentStep: 0, nextSendAt: firstSendAt },
    create: { contactId, sequenceId, status: "ACTIVE", currentStep: 0, nextSendAt: firstSendAt },
  });
}

export async function cancelEnrollment(contactId: string, sequenceId: string) {
  return prisma.sequenceEnrollment.updateMany({
    where: { contactId, sequenceId, status: "ACTIVE" },
    data: { status: "CANCELLED" },
  });
}

export async function cancelAllEnrollments(contactId: string) {
  return prisma.sequenceEnrollment.updateMany({
    where: { contactId, status: "ACTIVE" },
    data: { status: "CANCELLED" },
  });
}

// ─── Events ─────────────────────────────────────────────────

export async function logEmailEvent(data: {
  contactId: string;
  campaignId?: string;
  sequenceId?: string;
  type: string;
  subject?: string;
  messageId?: string;
}) {
  return prisma.emailEvent.create({ data });
}

export async function getEmailEvents(contactId: string) {
  return prisma.emailEvent.findMany({
    where: { contactId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getEmailMetrics() {
  const [totalSent, totalOpened, totalClicked, activeCampaigns, activeSequences] = await Promise.all([
    prisma.emailEvent.count({ where: { type: "sent" } }),
    prisma.emailEvent.count({ where: { type: "opened" } }),
    prisma.emailEvent.count({ where: { type: "clicked" } }),
    prisma.emailCampaign.count({ where: { status: { in: ["SCHEDULED", "SENDING"] } } }),
    prisma.emailSequence.count({ where: { active: true } }),
  ]);
  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
  const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;
  return { totalSent, totalOpened, totalClicked, openRate, clickRate, activeCampaigns, activeSequences };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/email.ts
git commit -m "feat: add email marketing server actions (templates, campaigns, sequences, events)"
```

---

## Task 3: Email Sender & Segment Resolver

**Files:**
- Create: `src/lib/email-sender.ts`
- Create: `src/lib/segment-resolver.ts`

- [ ] **Step 1: Create email sender**

Create `src/lib/email-sender.ts`:

```typescript
import { getResend } from "@/lib/email";
import { prisma } from "@/lib/db";

const FROM_EMAIL = process.env.FROM_EMAIL || "CreditLime <noreply@creditlime.com>";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

export async function sendMarketingEmail({
  to,
  subject,
  html,
  contactId,
  campaignId,
  sequenceId,
}: {
  to: string;
  subject: string;
  html: string;
  contactId: string;
  campaignId?: string;
  sequenceId?: string;
}): Promise<{ messageId: string | null; error: string | null }> {
  try {
    const resend = getResend();
    if (!resend) return { messageId: null, error: "Resend not configured" };

    // Wrap in branded template
    const wrappedHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:24px;">
      <strong style="font-size:18px;color:#1a1a1a;">Credit</strong><strong style="font-size:18px;color:#15803d;">Lime</strong>
    </div>
    <div style="background:white;border-radius:12px;padding:32px;border:1px solid #e4e4e7;">
      ${html}
    </div>
    <div style="margin-top:24px;text-align:center;color:#a1a1aa;font-size:12px;">
      <p>CreditLime - Fast loans for gig workers</p>
      <p><a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(to)}" style="color:#71717a;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`;

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: wrappedHtml,
    });

    const messageId = (result as { data?: { id?: string } })?.data?.id || null;

    // Log event
    await prisma.emailEvent.create({
      data: { contactId, campaignId, sequenceId, type: "sent", subject, messageId },
    });

    // Log activity
    await prisma.activity.create({
      data: { contactId, type: "email_sent", title: `Email sent: ${subject}`, performedBy: "system" },
    });

    return { messageId, error: null };
  } catch (err) {
    console.error("Email send error:", err);
    return { messageId: null, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
```

- [ ] **Step 2: Create segment resolver**

Create `src/lib/segment-resolver.ts`:

```typescript
import { prisma } from "@/lib/db";
import type { SegmentRule } from "@/types/email";

export async function resolveSegment(rules: SegmentRule[]): Promise<{ id: string; email: string; firstName: string }[]> {
  if (rules.length === 0) {
    return prisma.contact.findMany({ select: { id: true, email: true, firstName: true } });
  }

  // Build Prisma where clause from rules (AND logic)
  const conditions: Record<string, unknown>[] = [];

  for (const rule of rules) {
    switch (rule.field) {
      case "stage":
        if (rule.operator === "is") conditions.push({ stage: rule.value });
        if (rule.operator === "is_not") conditions.push({ stage: { not: rule.value } });
        break;
      case "tag":
        if (rule.operator === "is") conditions.push({ tags: { some: { tag: rule.value } } });
        if (rule.operator === "is_not") conditions.push({ tags: { none: { tag: rule.value } } });
        break;
      case "source":
        if (rule.operator === "is") conditions.push({ source: rule.value });
        if (rule.operator === "contains") conditions.push({ source: { contains: rule.value } });
        break;
      case "utmCampaign":
        if (rule.operator === "is") conditions.push({ utmCampaign: rule.value });
        break;
      case "assignedRepId":
        if (rule.operator === "is") conditions.push({ assignedRepId: rule.value });
        break;
      case "lastAppStep":
        if (rule.operator === "is") conditions.push({ lastAppStep: parseInt(rule.value) });
        if (rule.operator === "gt") conditions.push({ lastAppStep: { gt: parseInt(rule.value) } });
        if (rule.operator === "lt") conditions.push({ lastAppStep: { lt: parseInt(rule.value) } });
        break;
      case "createdAt":
        if (rule.operator === "gt") conditions.push({ createdAt: { gt: new Date(rule.value) } });
        if (rule.operator === "lt") conditions.push({ createdAt: { lt: new Date(rule.value) } });
        break;
    }
  }

  // Exclude unsubscribed contacts
  conditions.push({ tags: { none: { tag: "unsubscribed" } } });

  return prisma.contact.findMany({
    where: { AND: conditions },
    select: { id: true, email: true, firstName: true },
  });
}

export async function countSegment(rules: SegmentRule[]): Promise<number> {
  const contacts = await resolveSegment(rules);
  return contacts.length;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/email-sender.ts src/lib/segment-resolver.ts
git commit -m "feat: add email sender with branded wrapper and segment resolver"
```

---

## Task 4: Resend Webhook + Email Processor Cron

**Files:**
- Create: `src/app/api/email/webhook/route.ts`
- Create: `src/app/api/cron/email-processor/route.ts`

- [ ] **Step 1: Create Resend webhook handler**

Create `src/app/api/email/webhook/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Resend sends webhooks for: email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.complained
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    // Map Resend event types to our types
    const typeMap: Record<string, string> = {
      "email.delivered": "delivered",
      "email.opened": "opened",
      "email.clicked": "clicked",
      "email.bounced": "bounced",
      "email.complained": "unsubscribed",
    };

    const eventType = typeMap[type];
    if (!eventType || !data?.email_id) {
      return NextResponse.json({ ok: true });
    }

    // Find the original sent event by messageId
    const sentEvent = await prisma.emailEvent.findFirst({
      where: { messageId: data.email_id, type: "sent" },
    });

    if (sentEvent) {
      // Log the new event
      await prisma.emailEvent.create({
        data: {
          contactId: sentEvent.contactId,
          campaignId: sentEvent.campaignId,
          sequenceId: sentEvent.sequenceId,
          type: eventType,
          messageId: data.email_id,
        },
      });

      // Update campaign stats
      if (sentEvent.campaignId) {
        if (eventType === "opened") {
          await prisma.emailCampaign.update({
            where: { id: sentEvent.campaignId },
            data: { totalOpened: { increment: 1 } },
          });
        }
        if (eventType === "clicked") {
          await prisma.emailCampaign.update({
            where: { id: sentEvent.campaignId },
            data: { totalClicked: { increment: 1 } },
          });
        }
      }

      // Auto-unsubscribe on complaint
      if (eventType === "unsubscribed") {
        await prisma.contactTag.upsert({
          where: { contactId_tag: { contactId: sentEvent.contactId, tag: "unsubscribed" } },
          update: {},
          create: { contactId: sentEvent.contactId, tag: "unsubscribed" },
        });
      }

      // Log activity
      await prisma.activity.create({
        data: {
          contactId: sentEvent.contactId,
          type: `email_${eventType}`,
          title: `Email ${eventType}: ${sentEvent.subject || ""}`,
          performedBy: "system",
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ ok: true }); // Always 200 so Resend doesn't retry
  }
}
```

- [ ] **Step 2: Create email processor cron**

Create `src/app/api/cron/email-processor/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMarketingEmail } from "@/lib/email-sender";
import { resolveSegment } from "@/lib/segment-resolver";
import type { SequenceStep } from "@/types/email";
import type { SegmentRule } from "@/types/email";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let sequenceSent = 0;
  let campaignSent = 0;

  try {
    // ─── Process sequence enrollments ───────────────────────
    const dueEnrollments = await prisma.sequenceEnrollment.findMany({
      where: { status: "ACTIVE", nextSendAt: { lte: now } },
      include: { contact: { select: { id: true, email: true, firstName: true, tags: true } } },
    });

    for (const enrollment of dueEnrollments) {
      // Skip unsubscribed
      if (enrollment.contact.tags.some((t) => t.tag === "unsubscribed")) {
        await prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "CANCELLED" },
        });
        continue;
      }

      const sequence = await prisma.emailSequence.findUnique({ where: { id: enrollment.sequenceId } });
      if (!sequence || !sequence.active) {
        await prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "CANCELLED" },
        });
        continue;
      }

      const steps: SequenceStep[] = JSON.parse(sequence.steps);
      const currentStep = steps.find((s) => s.order === enrollment.currentStep);

      if (!currentStep) {
        await prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "COMPLETED" },
        });
        continue;
      }

      // Personalize
      const personalizedBody = currentStep.body
        .replace(/\{firstName\}/g, enrollment.contact.firstName)
        .replace(/\{email\}/g, enrollment.contact.email);
      const personalizedSubject = currentStep.subject
        .replace(/\{firstName\}/g, enrollment.contact.firstName);

      await sendMarketingEmail({
        to: enrollment.contact.email,
        subject: personalizedSubject,
        html: personalizedBody,
        contactId: enrollment.contact.id,
        sequenceId: enrollment.sequenceId,
      });

      // Advance to next step
      const nextStep = steps.find((s) => s.order === enrollment.currentStep + 1);
      if (nextStep) {
        const delayMs = nextStep.delayUnit === "days"
          ? nextStep.delayAmount * 24 * 60 * 60 * 1000
          : nextStep.delayAmount * 60 * 60 * 1000;
        await prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: {
            currentStep: enrollment.currentStep + 1,
            nextSendAt: new Date(now.getTime() + delayMs),
          },
        });
      } else {
        await prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "COMPLETED" },
        });
      }

      sequenceSent++;
    }

    // ─── Process scheduled campaigns ────────────────────────
    const dueCampaigns = await prisma.emailCampaign.findMany({
      where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    });

    for (const campaign of dueCampaigns) {
      await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: "SENDING" },
      });

      const rules: SegmentRule[] = JSON.parse(campaign.segmentRules);
      const audience = await resolveSegment(rules);

      let sent = 0;
      for (const contact of audience) {
        const personalizedBody = campaign.body
          .replace(/\{firstName\}/g, contact.firstName)
          .replace(/\{email\}/g, contact.email);
        const personalizedSubject = campaign.subject
          .replace(/\{firstName\}/g, contact.firstName);

        await sendMarketingEmail({
          to: contact.email,
          subject: personalizedSubject,
          html: personalizedBody,
          contactId: contact.id,
          campaignId: campaign.id,
        });
        sent++;
      }

      await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: "SENT", sentAt: now, totalSent: sent, audienceCount: audience.length },
      });
      campaignSent += sent;
    }

    return NextResponse.json({ ok: true, sequenceSent, campaignSent, timestamp: now.toISOString() });
  } catch (error) {
    console.error("Email processor error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/email/ src/app/api/cron/email-processor/
git commit -m "feat: add Resend webhook handler and email processor cron"
```

---

## Task 5: Seed Automated Sequences

**Files:**
- Create: `scripts/seed-email-sequences.ts`
- Modify: `package.json`

- [ ] **Step 1: Create seed script**

Create `scripts/seed-email-sequences.ts`:

```typescript
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const SEQUENCES = [
  {
    name: "Abandoned App Recovery",
    description: "Emails sent to contacts who started but didn't finish their application",
    triggerType: "abandoned_app",
    active: true,
    steps: [
      { id: "ab-1", order: 0, subject: "Hey {firstName}, you're almost done", body: "<h2>You were so close!</h2><p>You started your CreditLime application but didn't finish. It only takes 5 more minutes to complete.</p><p>Your loan amount is still reserved. Pick up where you left off:</p><p><a href='https://creditlime.com/apply' style='display:inline-block;background:#15803d;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;'>Complete My Application</a></p>", delayAmount: 1, delayUnit: "hours" },
      { id: "ab-2", order: 1, subject: "Still need that cash, {firstName}?", body: "<h2>Don't let this slip away</h2><p>We've held your spot. Most gig workers get funded within 48 hours of applying.</p><p>No credit check. No W-2. Just your platform earnings.</p><p><a href='https://creditlime.com/apply' style='display:inline-block;background:#15803d;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;'>Finish Applying</a></p>", delayAmount: 24, delayUnit: "hours" },
      { id: "ab-3", order: 2, subject: "Last chance to get funded, {firstName}", body: "<h2>Your application is about to expire</h2><p>We keep incomplete applications for 7 days. After that, you'll need to start over.</p><p>5 minutes is all it takes to get funded. Uber, Lyft, DoorDash drivers - we built this for you.</p><p><a href='https://creditlime.com/apply' style='display:inline-block;background:#15803d;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;'>Complete Now</a></p>", delayAmount: 7, delayUnit: "days" },
    ],
  },
  {
    name: "Application Submitted",
    description: "Confirmation email after application is submitted",
    triggerType: "stage_change",
    triggerValue: "APPLICANT",
    active: true,
    steps: [
      { id: "sub-1", order: 0, subject: "Application received, {firstName}!", body: "<h2>We got your application!</h2><p>Thanks for applying with CreditLime. We're reviewing your earnings now.</p><p>Most decisions are made within a few hours. We'll email you as soon as there's an update.</p><p>In the meantime, here's what happens next:</p><ul><li>We verify your platform earnings (no credit check)</li><li>You'll get an approval decision via email</li><li>If approved, funds hit your account in 24-48 hours</li></ul>", delayAmount: 0, delayUnit: "hours" },
    ],
  },
  {
    name: "Loan Funded",
    description: "Celebration email after loan is funded",
    triggerType: "stage_change",
    triggerValue: "FUNDED",
    active: true,
    steps: [
      { id: "fund-1", order: 0, subject: "You're funded, {firstName}!", body: "<h2>Cash is on the way!</h2><p>Your loan has been funded and is being transferred to your bank account.</p><p>Expect to see the funds within 24-48 hours.</p><p>Keep driving, keep earning. We've got your back.</p>", delayAmount: 0, delayUnit: "hours" },
    ],
  },
  {
    name: "Re-engagement",
    description: "Win back cold contacts after 30 days of inactivity",
    triggerType: "manual",
    active: false,
    steps: [
      { id: "re-1", order: 0, subject: "We miss you, {firstName}", body: "<h2>Still need a loan?</h2><p>It's been a while since we heard from you. Life as a gig worker doesn't slow down, and neither do we.</p><p>CreditLime is here whenever you're ready. $100 to $10,000, no credit check.</p><p><a href='https://creditlime.com/apply' style='display:inline-block;background:#15803d;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;'>Apply Now</a></p>", delayAmount: 0, delayUnit: "hours" },
      { id: "re-2", order: 1, subject: "Special offer for {firstName}", body: "<h2>Come back and save</h2><p>As a returning applicant, you may qualify for reduced fees on your next loan. Apply today to find out.</p><p><a href='https://creditlime.com/apply' style='display:inline-block;background:#15803d;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;'>Check My Rate</a></p>", delayAmount: 15, delayUnit: "days" },
    ],
  },
];

async function main() {
  console.log("Seeding email sequences...");

  for (const seq of SEQUENCES) {
    const existing = await prisma.emailSequence.findFirst({ where: { name: seq.name } });
    if (existing && process.env.SEED_FORCE !== "true") {
      console.log(`  Skipping "${seq.name}" (exists)`);
      continue;
    }
    if (existing) {
      await prisma.emailSequence.delete({ where: { id: existing.id } });
    }
    await prisma.emailSequence.create({
      data: {
        name: seq.name,
        description: seq.description,
        triggerType: seq.triggerType,
        triggerValue: seq.triggerValue || null,
        active: seq.active,
        steps: JSON.stringify(seq.steps),
      },
    });
    console.log(`  Created: ${seq.name}`);
  }

  console.log("Done.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
```

- [ ] **Step 2: Add to build pipeline and run**

Update `package.json` build script: add `&& npx tsx scripts/seed-email-sequences.ts` before `&& next build`.

Run: `npx tsx scripts/seed-email-sequences.ts`

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-email-sequences.ts package.json
git commit -m "feat: seed 4 automated email sequences (abandoned, submitted, funded, re-engagement)"
```

---

## Task 6: Hook Abandoned Cron Into Sequence Enrollment

**Files:**
- Modify: `src/app/api/cron/abandoned-check/route.ts`

- [ ] **Step 1: Add auto-enrollment after tagging**

Read `src/app/api/cron/abandoned-check/route.ts`. After the auto-tagging loop (where it creates ContactTag + Activity), add enrollment into the "Abandoned App Recovery" sequence.

After `tagged++;` inside the for loop, add:

```typescript
      // Auto-enroll in abandoned app recovery sequence
      const abandonedSequence = await prisma.emailSequence.findFirst({
        where: { triggerType: "abandoned_app", active: true },
      });
      if (abandonedSequence) {
        const steps = JSON.parse(abandonedSequence.steps);
        const firstDelay = steps[0];
        const delayMs = firstDelay
          ? (firstDelay.delayUnit === "days" ? firstDelay.delayAmount * 86400000 : firstDelay.delayAmount * 3600000)
          : 3600000;

        await prisma.sequenceEnrollment.upsert({
          where: { contactId_sequenceId: { contactId: contact.id, sequenceId: abandonedSequence.id } },
          update: {},
          create: {
            contactId: contact.id,
            sequenceId: abandonedSequence.id,
            status: "ACTIVE",
            currentStep: 0,
            nextSendAt: new Date(Date.now() + delayMs),
          },
        });
      }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/abandoned-check/
git commit -m "feat: auto-enroll abandoned contacts into email recovery sequence"
```

---

## Task 7: Email Dashboard + Admin Pages (Campaigns, Sequences, Templates)

This task creates all the admin email pages. It's large but follows established patterns.

**Files:**
- Replace: `src/app/admin/email/page.tsx`
- Create: `src/app/admin/email/email-dashboard-client.tsx`
- Create: `src/app/admin/email/campaigns/` (page, client, new/page, new/editor, [id]/page)
- Create: `src/app/admin/email/sequences/` (page, client, new/page, new/editor, [id]/page)
- Create: `src/app/admin/email/templates/` (page, client, new/page, new/editor, [id]/page)

- [ ] **Step 1: Create email dashboard**

Replace `src/app/admin/email/page.tsx`:

```tsx
import { getEmailMetrics } from "@/actions/email";
import { EmailDashboardClient } from "./email-dashboard-client";

export default async function EmailPage() {
  const metrics = await getEmailMetrics();
  return <EmailDashboardClient metrics={metrics} />;
}
```

Create `src/app/admin/email/email-dashboard-client.tsx`:

```tsx
"use client";

import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";

interface Metrics {
  totalSent: number;
  openRate: number;
  clickRate: number;
  activeCampaigns: number;
  activeSequences: number;
}

export function EmailDashboardClient({ metrics }: { metrics: Metrics }) {
  return (
    <div>
      <PageHeader title="Email Marketing" description="Campaigns, sequences, and templates" />

      <div className="grid grid-cols-5 gap-4 mb-8">
        <StatCard label="Emails Sent" value={metrics.totalSent} color="blue" />
        <StatCard label="Open Rate" value={`${metrics.openRate}%`} color="green" />
        <StatCard label="Click Rate" value={`${metrics.clickRate}%`} color="green" />
        <StatCard label="Active Campaigns" value={metrics.activeCampaigns} color="amber" />
        <StatCard label="Active Sequences" value={metrics.activeSequences} color="gray" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Campaigns", desc: "Send one-time emails to segments", href: "/admin/email/campaigns", cta: "View Campaigns" },
          { label: "Sequences", desc: "Automated drip sequences triggered by events", href: "/admin/email/sequences", cta: "View Sequences" },
          { label: "Templates", desc: "Reusable email templates", href: "/admin/email/templates", cta: "View Templates" },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="bg-white rounded-xl p-6 border border-[#e4e4e7] hover:shadow-sm transition-shadow">
            <h3 className="text-[15px] font-bold text-[#1a1a1a] mb-1">{item.label}</h3>
            <p className="text-[13px] text-[#71717a] mb-4">{item.desc}</p>
            <span className="text-[13px] font-medium text-[#15803d]">{item.cta} &rarr;</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create campaigns admin pages**

The implementing agent should create the campaigns CRUD following the exact same pattern as the landing pages admin:

**List** (`src/app/admin/email/campaigns/page.tsx` + `campaigns-client.tsx`): Table with name, status badge (DRAFT/SCHEDULED/SENDING/SENT), audience count, sent/opened/clicked, date.

**Editor** (`src/app/admin/email/campaigns/new/page.tsx` + `campaign-editor-client.tsx` + `[id]/page.tsx`):
- Subject line input (text)
- Body editor (Tiptap from `@/components/content/tiptap-editor`)
- **Segment builder**: repeatable rows, each with field dropdown (stage/tag/source/utmCampaign/assignedRepId/lastAppStep/createdAt), operator dropdown (is/is_not/contains/gt/lt), value input. Show live audience count by calling the segment resolver API.
- Schedule: datetime picker or "Send Now" button
- Status display

Create a simple API route for audience count: `src/app/api/email/audience-count/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { countSegment } from "@/lib/segment-resolver";

export async function POST(request: NextRequest) {
  const { rules } = await request.json();
  const count = await countSegment(rules || []);
  return NextResponse.json({ count });
}
```

Save button: calls `createEmailCampaign` or `updateEmailCampaign`. "Schedule" button sets status to SCHEDULED. "Send Now" sets scheduledAt to now and status to SCHEDULED (cron picks it up).

- [ ] **Step 3: Create sequences admin pages**

**List** (`src/app/admin/email/sequences/page.tsx` + `sequences-client.tsx`): Table with name, trigger type, steps count, active toggle, enrolled count.

**Editor** (`src/app/admin/email/sequences/new/page.tsx` + `sequence-editor-client.tsx` + `[id]/page.tsx`):
- Name, description
- Trigger: dropdown (abandoned_app, stage_change, manual) + trigger value input (for stage_change: which stage)
- Active toggle
- Steps builder: repeatable list. Each step has: subject (text), body (Tiptap editor), delay amount (number), delay unit (hours/days). Add/remove/reorder with arrows.
- Save button

- [ ] **Step 4: Create templates admin pages**

**List** (`src/app/admin/email/templates/page.tsx` + `templates-client.tsx`): Table with name, category, updated.

**Editor** (`src/app/admin/email/templates/new/page.tsx` + `template-editor-client.tsx` + `[id]/page.tsx`):
- Name, subject, category dropdown (transactional/marketing/sequence)
- Body: Tiptap editor
- Save button

- [ ] **Step 5: Update sidebar EMAIL group**

Read `src/components/admin/sidebar.tsx`. Find the EMAIL nav group. Replace the single "Email Marketing" item with sub-items:

```typescript
{
  title: "EMAIL",
  items: [
    { href: "/admin/email", label: "Overview", icon: <EmailIcon /> },
    { href: "/admin/email/campaigns", label: "Campaigns", icon: <EmailIcon /> },
    { href: "/admin/email/sequences", label: "Sequences", icon: <EmailIcon /> },
    { href: "/admin/email/templates", label: "Templates", icon: <EmailIcon /> },
  ],
},
```

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit
npm run build 2>&1 | tail -15
git add -A
git commit -m "feat: add email marketing admin (dashboard, campaigns, sequences, templates)"
```

---

## Task 8: Final Verification + Push

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Build check**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Run seeds**

```bash
npx tsx scripts/seed-email-sequences.ts
```

- [ ] **Step 4: Fix any issues, commit, done**

```bash
git add -A
git commit -m "fix: resolve build issues for Phase 3 email marketing"
```

Do NOT push — I'll merge from main.
