import { NextRequest, NextResponse } from "next/server";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { verifyCronSecret } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL) });
  try {
    const accounts = await prisma.socialAccount.findMany();
    const issues: Array<{ platform: string; handle: string; issue: string }> = [];
    const now = Date.now();

    for (const a of accounts) {
      if (a.botStatus !== "healthy") {
        issues.push({ platform: a.platform, handle: a.handle, issue: `bot ${a.botStatus}` });
      }
      if (a.tokenExpiresAt && a.tokenExpiresAt.getTime() - now < SEVEN_DAYS_MS) {
        issues.push({
          platform: a.platform,
          handle: a.handle,
          issue: `token expires ${a.tokenExpiresAt.toISOString()}`,
        });
      }
      if (!a.accessToken) {
        issues.push({ platform: a.platform, handle: a.handle, issue: "no token (needs auth)" });
      }
    }

    return NextResponse.json({ accounts: accounts.length, issues });
  } finally {
    await prisma.$disconnect();
  }
}
