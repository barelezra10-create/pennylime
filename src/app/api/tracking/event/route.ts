import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { TRACKING_EVENTS, type TrackingEventName, type AttributionData } from "@/lib/tracking/click-ids";

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

  if (!body.event || !TRACKING_EVENTS.includes(body.event as TrackingEventName)) {
    return new Response("invalid event", { status: 400 });
  }

  const attribution = body.attribution || {};

  let contactId: string | undefined;
  if (body.contactEmail) {
    const existing = await prisma.contact.findUnique({ where: { email: body.contactEmail }, select: { id: true } });
    contactId = existing?.id;
  }

  await prisma.trackingEvent.create({
    data: {
      eventName: body.event,
      contactId,
      clickIds: JSON.stringify(attribution),
      payload: JSON.stringify({ value: body.value, currency: body.currency, contactEmail: body.contactEmail }),
      value: body.value != null ? body.value : null,
      currency: body.currency || "USD",
      status: "received",
    },
  });

  return Response.json({ ok: true });
}
