"use server";

import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
async function requireTeamAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || (session.user as { role?: string }).role !== "ADMIN") throw new Error("Administrator access required");
  return session.user.email;
}
function validateRole(role: string) {
  if (!["ADMIN", "REP", "SUPPORT"].includes(role)) throw new Error("Invalid role");
}

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
  await requireTeamAdmin();
  validateRole(data.role);
  if (data.password.length < 12) throw new Error("Use a password of at least 12 characters");
  const passwordHash = await bcrypt.hash(data.password, 12);
  return prisma.adminUser.create({
    // Lowercase to match the login lookup, which normalizes the typed email.
    data: { email: data.email.trim().toLowerCase(), name: data.name, passwordHash, role: data.role },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
}

export async function updateTeamMemberRole(id: string, role: string) {
  await requireTeamAdmin();
  validateRole(role);
  return prisma.adminUser.update({ where: { id }, data: { role, mfaVersion: { increment: 1 } }, select: { id: true, email: true, name: true, role: true } });
}

export async function deleteTeamMember(id: string) {
  await requireTeamAdmin();
  await prisma.contact.updateMany({ where: { assignedRepId: id }, data: { assignedRepId: null } });
  return prisma.adminUser.delete({ where: { id }, select: { id: true } });
}
