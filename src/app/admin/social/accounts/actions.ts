"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { encryptToken } from "@/lib/social/crypto";

export async function saveCredentials(formData: FormData) {
  const id = String(formData.get("id"));
  const accessToken = String(formData.get("accessToken") ?? "").trim();
  const platformAccountId = String(formData.get("platformAccountId") ?? "").trim();
  const tokenExpiresInDays = Number(formData.get("tokenExpiresInDays") ?? "60");

  if (!id) return;

  await prisma.socialAccount.update({
    where: { id },
    data: {
      accessToken: accessToken ? encryptToken(accessToken) : "",
      platformAccountId: platformAccountId || null,
      tokenExpiresAt: accessToken
        ? new Date(Date.now() + tokenExpiresInDays * 24 * 60 * 60 * 1000)
        : null,
      botStatus: "healthy",
    },
  });
  revalidatePath("/admin/social/accounts");
  revalidatePath("/admin/social");
}

export async function saveBotCookies(formData: FormData) {
  const id = String(formData.get("id"));
  const cookies = String(formData.get("cookies") ?? "").trim();
  if (!id) return;

  await prisma.socialAccount.update({
    where: { id },
    data: {
      botCookies: cookies ? encryptToken(cookies) : null,
      botStatus: "healthy",
    },
  });
  revalidatePath("/admin/social/accounts");
  revalidatePath("/admin/social");
}
