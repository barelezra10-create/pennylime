"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function getRecentAdSpend(limit = 30) {
  return prisma.adSpend.findMany({
    orderBy: { date: "desc" },
    take: limit,
  });
}

export async function addAdSpend(formData: FormData) {
  const date = new Date(String(formData.get("date") || new Date().toISOString().slice(0, 10)));
  const platform = String(formData.get("platform") || "").trim();
  const campaign = String(formData.get("campaign") || "").trim() || null;
  const spend = Number(formData.get("spend") || 0);
  const impressions = Number(formData.get("impressions") || 0);
  const clicks = Number(formData.get("clicks") || 0);
  const conversions = Number(formData.get("conversions") || 0);
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!platform || !spend) return;

  await prisma.adSpend.create({
    data: { date, platform, campaign, spend, impressions, clicks, conversions, notes },
  });

  revalidatePath("/admin/dashboard");
}

export async function deleteAdSpend(id: string) {
  await prisma.adSpend.delete({ where: { id } });
  revalidatePath("/admin/dashboard");
}
