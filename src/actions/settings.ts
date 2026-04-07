"use server";

import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function getLoanRulesAction() {
  return prisma.loanRule.findMany({ orderBy: { key: "asc" } });
}

export async function updateLoanRule(id: string, value: string) {
  const session = await getServerSession(authOptions);

  const existing = await prisma.loanRule.findUnique({ where: { id } });
  if (!existing) throw new Error("Rule not found");
  const oldValue = existing.value;

  const rule = await prisma.loanRule.update({
    where: { id },
    data: { value },
  });

  if (session?.user?.email) {
    await logAudit({
      action: "CHANGE_SETTING",
      entityType: "LOAN_RULE",
      entityId: existing.key,
      performedBy: session.user.email,
      details: { oldValue, newValue: value },
    });
  }

  return rule;
}
