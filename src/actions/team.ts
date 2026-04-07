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
