"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { sendSms as sendSmsLib } from "@/lib/sms/twilio";
import { interpolate } from "@/lib/sms/interpolate";
import { logActivity } from "@/actions/activities";

const SLEEP = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendSmsToContact(formData: FormData) {
  const contactId = String(formData.get("contactId") || "");
  const body = String(formData.get("body") || "").trim();
  if (!contactId || !body) return { ok: false, error: "Missing contact or body" };

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact?.phone) return { ok: false, error: "Contact has no phone number" };

  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("host") || "";
  const baseUrl = host ? `${proto}://${host}` : undefined;

  const result = await sendSmsLib({
    to: contact.phone,
    body,
    contactId: contact.id,
    statusCallbackBaseUrl: baseUrl,
  });

  if (result.ok) {
    await logActivity({
      contactId,
      type: "sms_sent",
      title: "SMS sent",
      details: body.length > 80 ? body.slice(0, 77) + "…" : body,
    });
  }

  revalidatePath(`/admin/contacts/${contactId}`);
  return result;
}

export async function createSmsTemplate(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  if (!name || !body) return;

  await prisma.smsTemplate.create({ data: { name, body, description } });
  revalidatePath("/admin/sms/templates");
}

export async function deleteSmsTemplate(id: string) {
  await prisma.smsTemplate.delete({ where: { id } });
  revalidatePath("/admin/sms/templates");
}

export async function getSmsTemplates() {
  return prisma.smsTemplate.findMany({ orderBy: { updatedAt: "desc" } });
}

/* ─── Campaigns ─────────────────────────────────────────────── */

export async function getSmsCampaigns() {
  return prisma.smsCampaign.findMany({ orderBy: { updatedAt: "desc" } });
}

export async function getSmsCampaign(id: string) {
  return prisma.smsCampaign.findUnique({ where: { id } });
}

export async function createSmsCampaign(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const segmentRules = String(formData.get("segmentRules") || "[]").trim() || "[]";
  const templateId = String(formData.get("templateId") || "").trim() || null;
  if (!name || !body) return;
  await prisma.smsCampaign.create({ data: { name, body, templateId, segmentRules, status: "DRAFT" } });
  revalidatePath("/admin/sms/campaigns");
}

export async function updateSmsCampaign(id: string, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const segmentRules = String(formData.get("segmentRules") || "[]").trim() || "[]";
  if (!name || !body) return;
  await prisma.smsCampaign.update({ where: { id }, data: { name, body, segmentRules } });
  revalidatePath("/admin/sms/campaigns");
}

/* Object-shaped wrappers so client components can call the server actions
   directly without packing into FormData. Mirrors the email actions. */

export async function saveSmsCampaign(data: {
  id?: string;
  name: string;
  body: string;
  segmentRules: string;
  status: "DRAFT" | "SCHEDULED";
  scheduledAt?: string;
  templateId?: string | null;
}) {
  const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
  const payload = {
    name: data.name,
    body: data.body,
    segmentRules: data.segmentRules,
    status: data.status,
    scheduledAt,
    templateId: data.templateId ?? null,
  };
  if (data.id) {
    await prisma.smsCampaign.update({ where: { id: data.id }, data: payload });
  } else {
    await prisma.smsCampaign.create({ data: payload });
  }
  revalidatePath("/admin/sms/campaigns");
}

export async function deleteSmsCampaign(id: string) {
  await prisma.smsCampaign.delete({ where: { id } });
  revalidatePath("/admin/sms/campaigns");
}

type SegmentRule = { stage?: string; tag?: string; hasLoan?: boolean; verifiedPhone?: boolean };

async function selectAudience(rules: SegmentRule[]) {
  const where: Record<string, unknown> = {
    smsOptIn: true,
    phone: { not: null },
  };
  for (const r of rules) {
    if (r.stage) where.stage = r.stage;
    if (r.tag) where.tags = { some: { tag: r.tag } };
    if (r.hasLoan) where.applicationId = { not: null };
    if (r.verifiedPhone) where.phoneVerifiedAt = { not: null };
  }
  return prisma.contact.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      application: { select: { applicationCode: true, loanAmount: true } },
    },
  });
}

export async function previewSmsCampaign(id: string) {
  const campaign = await prisma.smsCampaign.findUnique({ where: { id } });
  if (!campaign) return { ok: false, error: "campaign not found", count: 0, sample: [] as string[] };
  let rules: SegmentRule[] = [];
  try {
    rules = JSON.parse(campaign.segmentRules) as SegmentRule[];
    if (!Array.isArray(rules)) rules = [];
  } catch {}
  const audience = await selectAudience(rules);
  return {
    ok: true,
    count: audience.length,
    sample: audience.slice(0, 5).map((c) => `${c.firstName} ${c.lastName || ""} · ${c.phone}`),
  };
}

export async function sendSmsCampaign(id: string) {
  const campaign = await prisma.smsCampaign.findUnique({ where: { id } });
  if (!campaign) return { ok: false, error: "campaign not found", sent: 0, failed: 0 };
  if (campaign.status === "SENT") return { ok: false, error: "campaign already sent", sent: 0, failed: 0 };

  let rules: SegmentRule[] = [];
  try {
    rules = JSON.parse(campaign.segmentRules) as SegmentRule[];
    if (!Array.isArray(rules)) rules = [];
  } catch {}

  const audience = await selectAudience(rules);

  await prisma.smsCampaign.update({
    where: { id },
    data: { status: "SENDING", audienceCount: audience.length, sentAt: new Date() },
  });

  let sent = 0;
  let failed = 0;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("host") || "";
  const baseUrl = host ? `${proto}://${host}` : undefined;

  for (const c of audience) {
    if (!c.phone) continue;
    const body = interpolate(campaign.body, {
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      loanAmount: c.application ? Number(c.application.loanAmount) : null,
      applicationCode: c.application?.applicationCode || null,
    });
    const r = await sendSmsLib({
      to: c.phone,
      body,
      contactId: c.id,
      campaignId: id,
      statusCallbackBaseUrl: baseUrl,
    });
    if (r.ok) sent++;
    else failed++;
    // Throttle: ~10 messages/sec to stay under Twilio default
    await SLEEP(120);
  }

  await prisma.smsCampaign.update({
    where: { id },
    data: { status: "SENT", totalSent: sent, totalFailed: failed },
  });

  revalidatePath("/admin/sms/campaigns");
  return { ok: true, sent, failed };
}

/* ─── Sequences ─────────────────────────────────────────────── */

export async function getSmsSequences() {
  return prisma.smsSequence.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getSmsSequence(id: string) {
  return prisma.smsSequence.findUnique({ where: { id } });
}

export async function createSmsSequence(data: {
  name: string;
  description?: string;
  steps: string;
  triggerType: string;
  triggerValue?: string;
  active?: boolean;
}) {
  const created = await prisma.smsSequence.create({ data });
  revalidatePath("/admin/sms/sequences");
  return created;
}

export async function updateSmsSequence(id: string, data: Record<string, unknown>) {
  const updated = await prisma.smsSequence.update({ where: { id }, data: data as never });
  revalidatePath("/admin/sms/sequences");
  return updated;
}

export async function deleteSmsSequence(id: string) {
  await prisma.smsSequenceEnrollment.deleteMany({ where: { sequenceId: id } });
  const deleted = await prisma.smsSequence.delete({ where: { id } });
  revalidatePath("/admin/sms/sequences");
  return deleted;
}

/**
 * Send a single test SMS to the admin's phone, rendered with sample
 * variable values. Mirrors `sendTestEmail` but for SMS.
 */
export async function sendTestSms(input: { to: string; body: string }) {
  const { getServerSession } = await import("next-auth");
  const { authOptions } = await import("@/lib/auth");
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { ok: false as const, error: "Not authenticated" };
  if (!input.to.trim()) return { ok: false as const, error: "Provide a phone number" };

  const sampleVars = {
    firstName: "Sample",
    lastName: "User",
    email: "sample@example.com",
    phone: input.to,
    loanAmount: 500,
    applicationCode: "PL-TEST-0001",
  };
  const body = interpolate(input.body, sampleVars);
  return sendSmsLib({ to: input.to, body });
}


