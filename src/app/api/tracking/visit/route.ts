import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import type { AttributionData } from "@/lib/tracking/click-ids";

const PENNYCLICK_COOKIE = "_pl_clickid";

export async function POST(req: NextRequest) {
  const pennyClickId = req.cookies.get(PENNYCLICK_COOKIE)?.value;
  if (!pennyClickId) return Response.json({ ok: false, reason: "no-cookie" }, { status: 400 });

  let body: { attribution?: AttributionData };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const a: AttributionData = body.attribution || {};
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || null;
  const userAgent = req.headers.get("user-agent");

  const existing = await prisma.pennyClick.findUnique({ where: { id: pennyClickId } });

  if (existing) {
    await prisma.pennyClick.update({
      where: { id: pennyClickId },
      data: {
        visitCount: { increment: 1 },
        lastSeen: new Date(),
        lastUtmSource: a.utm_source || existing.lastUtmSource,
        lastUtmMedium: a.utm_medium || existing.lastUtmMedium,
        lastUtmCampaign: a.utm_campaign || existing.lastUtmCampaign,
        lastGclid: a.gclid || existing.lastGclid,
        lastFbclid: a.fbclid || existing.lastFbclid,
        lastTtclid: a.ttclid || existing.lastTtclid,
        lastMsclkid: a.msclkid || existing.lastMsclkid,
        lastLandingPage: a.landingPage || existing.lastLandingPage,
      },
    });
  } else {
    await prisma.pennyClick.create({
      data: {
        id: pennyClickId,
        firstUtmSource: a.utm_source,
        firstUtmMedium: a.utm_medium,
        firstUtmCampaign: a.utm_campaign,
        firstUtmTerm: a.utm_term,
        firstUtmContent: a.utm_content,
        firstGclid: a.gclid,
        firstGbraid: a.gbraid,
        firstWbraid: a.wbraid,
        firstFbclid: a.fbclid,
        firstTtclid: a.ttclid,
        firstMsclkid: a.msclkid,
        firstLandingPage: a.landingPage,
        firstReferrer: a.referrer,
        firstUserAgent: userAgent,
        firstIpAddress: ip,
        lastUtmSource: a.utm_source,
        lastUtmMedium: a.utm_medium,
        lastUtmCampaign: a.utm_campaign,
        lastGclid: a.gclid,
        lastFbclid: a.fbclid,
        lastTtclid: a.ttclid,
        lastMsclkid: a.msclkid,
        lastLandingPage: a.landingPage,
      },
    });
  }

  return Response.json({ ok: true, pennyClickId });
}
