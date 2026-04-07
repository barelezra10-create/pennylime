import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { webhook_type, webhook_code, item_id } = body;

    console.log(`Plaid webhook: ${webhook_type}/${webhook_code} for item ${item_id}`);

    if (webhook_type === "ITEM" && ["PENDING_EXPIRATION", "ERROR", "LOGIN_REQUIRED"].includes(webhook_code)) {
      // Bank credentials expired or errored, mark as stale for re-link
      await prisma.application.updateMany({
        where: { plaidItemId: item_id },
        data: { plaidLinkStale: true },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Plaid webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
