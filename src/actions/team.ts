"use server";

import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireNonSupportRole } from "@/lib/auth-helpers";

export async function getTeamMembers() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Not authenticated");
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
  const auth = await requireNonSupportRole();
  if (!auth.ok) throw new Error(auth.error);
  const passwordHash = await bcrypt.hash(data.password, 12);
  return prisma.adminUser.create({
    data: { email: data.email, name: data.name, passwordHash, role: data.role },
  });
}

export async function updateTeamMemberRole(id: string, role: string) {
  const auth = await requireNonSupportRole();
  if (!auth.ok) throw new Error(auth.error);
  return prisma.adminUser.update({ where: { id }, data: { role } });
}

export async function deleteTeamMember(id: string) {
  const auth = await requireNonSupportRole();
  if (!auth.ok) throw new Error(auth.error);
  await prisma.contact.updateMany({ where: { assignedRepId: id }, data: { assignedRepId: null } });
  return prisma.adminUser.delete({ where: { id } });
}
