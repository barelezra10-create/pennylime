import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type SmsRule = {
  stage?: string;
  tag?: string;
  hasLoan?: boolean;
  verifiedPhone?: boolean;
};

function whereFromRules(rules: SmsRule[]) {
  const where: Record<string, unknown> = {
    smsOptIn: true,
    phone: { not: null },
  };
  for (const r of rules || []) {
    if (r.stage) where.stage = r.stage;
    if (r.tag) where.tags = { some: { tag: r.tag } };
    if (r.hasLoan) where.applicationId = { not: null };
    if (r.verifiedPhone) where.phoneVerifiedAt = { not: null };
  }
  return where;
}

export async function POST(request: NextRequest) {
  const { rules } = (await request.json()) as { rules?: SmsRule[] };
  const where = whereFromRules(rules ?? []);
  const count = await prisma.contact.count({ where });
  const sample = await prisma.contact.findMany({
    where,
    take: 5,
    select: { firstName: true, lastName: true, phone: true },
  });
  return NextResponse.json({
    count,
    sample: sample.map((c) => `${c.firstName} ${c.lastName || ""} · ${c.phone}`),
  });
}
