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
