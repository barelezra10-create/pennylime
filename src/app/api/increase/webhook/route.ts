import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";

/**
 * Increase webhook receiver.
 * Verify HMAC signature, then update Application / Payment status based on
 * ACH transfer events (transfer.created, ach_transfer.updated, etc.).
 */

function verifySignature(rawBody: string, headerSig: string | null): boolean {
  const secret = process.env.INCREASE_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: missing secret in prod must NOT mean "accept everything".
    // Better to drop legit webhooks until the env var is set than to allow
    // anyone on the internet to forge transfer-status updates.
    if (process.env.NODE_ENV === "production") {
      console.error("[increase webhook] INCREASE_WEBHOOK_SECRET missing in production - rejecting");
      return false;
    }
    return true; // dev / local only
  }
  if (!headerSig) return false;

  // Increase signs with HMAC-SHA256, header format: t=<unix>,v1=<hexsig>
  const parts = Object.fromEntries(headerSig.split(",").map((p) => p.split("=") as [string, string]));
  const ts = parts.t;
  const sig = parts.v1;
  if (!ts || !sig) return false;

  const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("Increase-Webhook-Signature");
  if (!verifySignature(raw, sig)) return new Response("invalid signature", { status: 401 });

  let body: { type?: string; associated_object_type?: string; associated_object_id?: string; created_at?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const objectType = body.associated_object_type;
  const objectId = body.associated_object_id;
  const eventType = body.type;

  if (objectType === "ach_transfer" && objectId) {
    const status = eventType?.replace("ach_transfer.", "") || "";
    // Increase ACH statuses we care about:
    //   "submitted" -> NACHA file delivered to the Fed, not yet posted at
    //   the receiving bank. Treat as in-flight, NOT settled.
    //   "settled"   -> money has posted at the destination.
    //   "returned"  -> ACH return (NSF / R-code).
    const isReturn = status === "returned";
    const isSettled = status === "settled";
    const isInflight = status === "submitted" || status === "pending_submission";

    // Disbursement leg: webhook fires when our credit to the borrower
    // posts. Flip APPROVED -> FUNDED so the UI + financial summaries
    // reflect reality even if the original fundApplication() retry path
    // never got back to us.
    const app = await prisma.application.findFirst({ where: { increaseTransferId: objectId } });
    if (app) {
      const nextAppStatus =
        app.status === "APPROVED" && (isSettled || isInflight) ? "FUNDED" : app.status;
      await prisma.application.update({
        where: { id: app.id },
        data: {
          increaseTransferStatus: status || null,
          status: nextAppStatus,
          fundedAt: app.fundedAt ?? ((isSettled || isInflight) ? new Date() : null),
        },
      });
    }
    // Repayment leg: webhook fires when a borrower's weekly debit either
    // posts (settle -> PAID) or returns (NSF -> RETURNED).
    const payment = await prisma.payment.findFirst({ where: { increaseTransferId: objectId } });
    if (payment) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          increaseTransferStatus: status,
          paidAt: isSettled ? new Date() : payment.paidAt,
          status: isReturn ? "RETURNED" : isSettled ? "PAID" : payment.status,
        },
      });
    }
  }

  return Response.json({ ok: true });
}
