import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import type { AttributionData } from "@/lib/tracking/click-ids";

export async function POST(req: NextRequest) {
  let body: {
    event?: string;
    value?: number;
    currency?: string;
    contactEmail?: string;
    attribution?: AttributionData;
  };

  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  if (!body.event || typeof body.event !== "string" || !/^[a-z0-9_]{1,64}$/.test(body.event)) {
    return new Response("invalid event", { status: 400 });
  }

  const attribution = body.attribution || {};
  const pennyClickId = req.cookies.get("_pl_clickid")?.value;

  let contactId: string | undefined;
  if (body.contactEmail) {
    const existing = await prisma.contact.findUnique({ where: { email: body.contactEmail }, select: { id: true } });
    contactId = existing?.id;
  }

  await prisma.trackingEvent.create({
    data: {
      eventName: body.event,
      contactId,
      pennyClickId,
      clickIds: JSON.stringify({ ...attribution, pennyClickId }),
      payload: JSON.stringify({ value: body.value, currency: body.currency, contactEmail: body.contactEmail }),
      value: body.value != null ? body.value : null,
      currency: body.currency || "USD",
      status: "received",
    },
  });

  return Response.json({ ok: true });
}
