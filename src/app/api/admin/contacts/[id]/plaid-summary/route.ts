import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;

  const contact = await prisma.contact.findUnique({
    where: { id },
    select: {
      application: {
        select: {
          id: true,
          plaidAccessToken: true,
          plaidInstitutionName: true,
          plaidAccountMask: true,
          bankBalance: true,
          availableBalance: true,
          monthlyIncome: true,
          avgWeeklyIncome: true,
          depositCadence: true,
          depositCount90d: true,
          lastPlaidRefresh: true,
        },
      },
    },
  });
  if (!contact) return NextResponse.json({ error: "contact not found" }, { status: 404 });

  const app = contact.application;
  if (!app) {
    return NextResponse.json({
      hasPlaid: false,
      institutionName: null,
      accountMask: null,
      bankBalance: null,
      availableBalance: null,
      monthlyIncome: null,
      avgWeeklyIncome: null,
      depositCadence: null,
      depositCount90d: null,
      lastPlaidRefresh: null,
      applicationId: null,
    });
  }

  return NextResponse.json({
    hasPlaid: !!app.plaidAccessToken,
    institutionName: app.plaidInstitutionName ?? null,
    accountMask: app.plaidAccountMask ?? null,
    bankBalance: app.bankBalance != null ? Number(app.bankBalance) : null,
    availableBalance: app.availableBalance != null ? Number(app.availableBalance) : null,
    monthlyIncome: app.monthlyIncome != null ? Number(app.monthlyIncome) : null,
    avgWeeklyIncome: app.avgWeeklyIncome != null ? Number(app.avgWeeklyIncome) : null,
    depositCadence: app.depositCadence ?? null,
    depositCount90d: app.depositCount90d ?? null,
    lastPlaidRefresh: app.lastPlaidRefresh ? app.lastPlaidRefresh.toISOString() : null,
    applicationId: app.id,
  });
}
