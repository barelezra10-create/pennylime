"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { sendSms as sendSmsLib } from "@/lib/sms/twilio";
import { logActivity } from "@/actions/activities";

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
