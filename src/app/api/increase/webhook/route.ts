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
  if (!secret) return true; // no secret set yet; accept (dev only)
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
    // Update Application or Payment by Increase transfer ID
    const app = await prisma.application.findFirst({ where: { increaseTransferId: objectId } });
    if (app) {
      await prisma.application.update({
        where: { id: app.id },
        data: { increaseTransferStatus: eventType?.replace("ach_transfer.", "") || null },
      });
    }
    const payment = await prisma.payment.findFirst({ where: { increaseTransferId: objectId } });
    if (payment) {
      const status = eventType?.replace("ach_transfer.", "") || "";
      const isReturn = status.includes("returned") || status === "returned";
      const isSettled = status === "settled" || status === "submitted";
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
