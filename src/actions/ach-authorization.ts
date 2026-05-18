"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type AchAuthorizationSnapshot = {
  id: string;
  acceptedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  bankName: string | null;
  bankAccountMask: string | null;
  totalDebitAmount: number;
  authorizationText: string;
  agreementVersion: string | null;
  signedName: string | null;
  scrolledToBottom: boolean;
  schedule: Array<{
    paymentNumber: number;
    date: string;
    amount: number;
    principal: number;
    interest: number;
  }>;
};

/**
 * Returns the immutable ACH authorization record captured at offer
 * acceptance time — the legal proof that the customer agreed to be
 * debited on the specific schedule shown. Admin-only.
 */
export async function getAchAuthorization(
  applicationId: string,
): Promise<AchAuthorizationSnapshot | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const row = await prisma.achAuthorization.findFirst({
    where: { applicationId },
    orderBy: { acceptedAt: "desc" },
  });
  if (!row) return null;
  let schedule: AchAuthorizationSnapshot["schedule"] = [];
  try {
    schedule = JSON.parse(row.scheduleJson);
  } catch {
    schedule = [];
  }
  return {
    id: row.id,
    acceptedAt: row.acceptedAt.toISOString(),
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    bankName: row.bankName,
    bankAccountMask: row.bankAccountMask,
    totalDebitAmount: Number(row.totalDebitAmount),
    authorizationText: row.authorizationText,
    agreementVersion: row.agreementVersion,
    signedName: row.signedName,
    scrolledToBottom: row.scrolledToBottom,
    schedule,
  };
}
