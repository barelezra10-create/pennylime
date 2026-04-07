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
