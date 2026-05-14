"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

const VALID_CATEGORIES = ["tax", "cashflow", "platform-tips", "earnings", "savings", "news"] as const;
type Category = typeof VALID_CATEGORIES[number];

function isValidCategory(c: string): c is Category {
  return (VALID_CATEGORIES as ReadonlyArray<string>).includes(c);
}

export async function addTopic(formData: FormData) {
  const topic = String(formData.get("topic") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "cashflow");
  if (!topic) return;
  if (!isValidCategory(categoryRaw)) return;
  await prisma.topicPool.create({ data: { topic, category: categoryRaw } });
  revalidatePath("/admin/social/topics");
}

export async function toggleTopic(id: string) {
  const t = await prisma.topicPool.findUnique({ where: { id } });
  if (!t) return;
  await prisma.topicPool.update({ where: { id }, data: { active: !t.active } });
  revalidatePath("/admin/social/topics");
}
