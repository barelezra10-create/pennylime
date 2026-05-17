"use server";

import { prisma } from "@/lib/db";
import { fireServerEvent } from "@/lib/tracking/server-events";

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
      include: {
        tags: true,
        assignedRep: { select: { id: true, name: true } },
        application: {
          include: {
            payments: {
              orderBy: { paymentNumber: "asc" },
              select: {
                id: true,
                amount: true,
                principal: true,
                interest: true,
                lateFee: true,
                dueDate: true,
                paidAt: true,
                status: true,
                paymentNumber: true,
              },
            },
          },
        },
      },
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
      application: {
        include: {
          payments: { orderBy: { paymentNumber: "asc" } },
        },
      },
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
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  ttclid?: string;
  msclkid?: string;
  landingPage?: string;
  referrer?: string;
  pennyClickId?: string;
  lastAppStep?: number;
  loanAmountIntent?: number;
}) {
  // Check if the contact already exists so we can distinguish "new lead"
  // (fire admin notification) from "returning visitor" (no notification).
  const existed = await prisma.contact.findUnique({
    where: { email: data.email },
    select: { id: true },
  });

  const contact = await prisma.contact.upsert({
    where: { email: data.email },
    update: {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      lastAppStep: data.lastAppStep,
      loanAmountIntent: data.loanAmountIntent ?? undefined,
      utmSource: data.utmSource || undefined,
      utmCampaign: data.utmCampaign || undefined,
      utmMedium: data.utmMedium || undefined,
      utmTerm: data.utmTerm || undefined,
      utmContent: data.utmContent || undefined,
      gclid: data.gclid || undefined,
      gbraid: data.gbraid || undefined,
      wbraid: data.wbraid || undefined,
      fbclid: data.fbclid || undefined,
      ttclid: data.ttclid || undefined,
      msclkid: data.msclkid || undefined,
      landingPage: data.landingPage || undefined,
      referrer: data.referrer || undefined,
      pennyClickId: data.pennyClickId || undefined,
    },
    create: {
      ...data,
      stage: "LEAD",
    },
  });

  // Link the PennyClick visit history to this contact
  if (data.pennyClickId) {
    await prisma.pennyClick.updateMany({
      where: { id: data.pennyClickId, contactId: null },
      data: { contactId: contact.id },
    });
  }

  // Admin notification — only on first creation, never on returning visits.
  if (!existed) {
    try {
      const { notifyAdmins, getAdminUrl } = await import("@/lib/notify");
      const url = `${getAdminUrl()}/admin/contacts/${contact.id}`;
      const fullName = [data.firstName, data.lastName].filter(Boolean).join(" ");
      notifyAdmins("leadCreated", {
        subject: `New lead — ${fullName || data.email}`,
        html: `<p>New lead just hit pennylime.com.</p>
<ul>
  <li><strong>Name:</strong> ${fullName || "—"}</li>
  <li><strong>Email:</strong> <a href="mailto:${data.email}">${data.email}</a></li>
  <li><strong>Phone:</strong> ${data.phone || "—"}</li>
  <li><strong>Source:</strong> ${data.source || "direct"}</li>
  <li><strong>UTM campaign:</strong> ${data.utmCampaign || "—"}</li>
  <li><strong>Landing page:</strong> ${data.landingPage || "—"}</li>
  ${data.loanAmountIntent ? `<li><strong>Advance amount intent:</strong> $${data.loanAmountIntent.toLocaleString()}</li>` : ""}
</ul>
<p><a href="${url}">View in CRM</a></p>`,
      }).catch(() => {});
    } catch {
      // never block the lead capture path
    }
  }

  return contact;
}

// Maps a Contact stage to the email sequence that should fire on entry.
// Driven by EmailSequence.triggerType = "stage_change" + triggerValue = stage.
// Sequence rows are seeded by scripts/seed-email-sequences.ts.
// APPLICANT/APPROVED/REJECTED/FUNDED are intentionally absent: transactional
// emails for those stages fire directly from src/actions/applications.ts to
// avoid duplicate sends. Add new stages here for follow-up drip sequences.
const STAGE_EMAIL_TRIGGERS: Record<string, string> = {};

async function enrollInStageSequence(contactId: string, stage: string) {
  const triggerValue = STAGE_EMAIL_TRIGGERS[stage];
  if (!triggerValue) return;
  const seq = await prisma.emailSequence.findFirst({
    where: { triggerType: "stage_change", triggerValue, active: true },
  });
  if (!seq) return;
  await prisma.sequenceEnrollment.upsert({
    where: { contactId_sequenceId: { contactId, sequenceId: seq.id } },
    update: {
      // If they hit the stage again somehow, re-fire from step 0.
      status: "ACTIVE",
      currentStep: 0,
      nextSendAt: new Date(),
    },
    create: {
      contactId,
      sequenceId: seq.id,
      status: "ACTIVE",
      currentStep: 0,
      nextSendAt: new Date(),
    },
  });
}

export async function updateContactStage(id: string, stage: string) {
  const updated = await prisma.contact.update({ where: { id }, data: { stage } });
  // Fire server-side conversion when entering high-value stages
  if (stage === "APPROVED" || stage === "FUNDED" || stage === "REPAYING" || stage === "PAID_OFF") {
    const eventName =
      stage === "APPROVED"
        ? "approved"
        : stage === "FUNDED" || stage === "REPAYING"
          ? "funded"
          : "funded";
    // Fire-and-forget; tracking failures must not break stage updates
    fireServerEvent({ eventName, contactId: id }).catch((err) => {
      console.error("[tracking] fireServerEvent failed:", err);
    });
  }
  // Email sequence enrollment for stage-triggered messages. Best-effort —
  // failures are logged but never break the stage update itself.
  enrollInStageSequence(id, stage).catch((err) => {
    console.error("[email] enrollInStageSequence failed:", err);
  });
  return updated;
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
