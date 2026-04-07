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
