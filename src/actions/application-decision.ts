"use server";

import { prisma } from "@/lib/db";
import { requireNonSupportRole } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export async function withdrawApplication(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const auth = await requireNonSupportRole();
    if (!auth.ok) return { ok: false, error: auth.error };

    await prisma.application.update({
      where: { id },
      data: { status: "REJECTED" },
    });

    await prisma.contact.updateMany({
      where: { applicationId: id },
      data: { stage: "REJECTED" },
    });

    await logAudit({
      action: "WITHDRAW_APPLICATION",
      entityType: "APPLICATION",
      entityId: id,
      performedBy: auth.email,
      details: { mode: "withdraw" },
    });

    revalidatePath("/admin/applications");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function cancelApplication(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const auth = await requireNonSupportRole();
    if (!auth.ok) return { ok: false, error: auth.error };

    await prisma.application.update({
      where: { id },
      data: { status: "REJECTED" },
    });

    await prisma.contact.updateMany({
      where: { applicationId: id },
      data: { stage: "REJECTED" },
    });

    await logAudit({
      action: "CANCEL_APPLICATION",
      entityType: "APPLICATION",
      entityId: id,
      performedBy: auth.email,
      details: { mode: "cancel" },
    });

    revalidatePath("/admin/applications");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
