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
