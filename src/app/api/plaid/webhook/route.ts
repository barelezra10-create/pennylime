import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { webhook_type, webhook_code, item_id } = body as {
      webhook_type?: string;
      webhook_code?: string;
      item_id?: string;
    };

    console.log(`Plaid webhook: ${webhook_type}/${webhook_code} for item ${item_id}`);

    if (
      webhook_type === "ITEM" &&
      ["PENDING_EXPIRATION", "ERROR", "LOGIN_REQUIRED"].includes(webhook_code ?? "")
    ) {
      // Bank credentials expired or errored, mark as stale for re-link
      if (item_id) {
        await prisma.application.updateMany({
          where: { plaidItemId: item_id },
          data: { plaidLinkStale: true },
        });
      }
    }

    // Asset report finished building → fetch + parse + populate income.
    // Plaid sends ASSETS/PRODUCT_READY with the asset_report_token. We
    // look up the application by token and run the fetch.
    if (webhook_type === "ASSETS" && webhook_code === "PRODUCT_READY") {
      const reportToken = (body as { asset_report_token?: string }).asset_report_token;
      let app:
        | { id: string; plaidAssetReportToken: string | null }
        | null = null;
      if (reportToken) {
        app = await prisma.application.findFirst({
          where: { plaidAssetReportToken: reportToken },
          select: { id: true, plaidAssetReportToken: true },
        });
      }
      // Fallback when the webhook doesn't include the token: pick the
      // most recent app that's still missing income.
      if (!app) {
        app = await prisma.application.findFirst({
          where: { plaidAssetReportToken: { not: null }, monthlyIncome: null },
          orderBy: { createdAt: "desc" },
          select: { id: true, plaidAssetReportToken: true },
        });
      }
      if (app) {
        const { fetchAssetReportAndStoreIncome } = await import("@/actions/plaid");
        const result = await fetchAssetReportAndStoreIncome(app.id);
        console.log(
          `Asset report fetched for application ${app.id}:`,
          result.success ? `income=${result.monthlyIncome}` : result.error,
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Plaid webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
