import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPortalApplicationId } from "@/lib/portal-auth";
import { SettlementSigning } from "./settlement-signing";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Review your settlement · PennyLime",
  robots: { index: false, follow: false },
};
export default async function SettlementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const applicationId = await getPortalApplicationId();
  if (!applicationId)
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-2xl font-bold">
          Sign in to review your settlement
        </h1>
        <p className="my-4 text-zinc-600">
          After signing in, choose “Settlement agreements” in your account, or
          reopen the link in your email.
        </p>
        <Link
          href="/portal/login"
          className="inline-block rounded-lg bg-green-700 px-5 py-3 text-sm font-semibold text-white"
        >
          Sign in securely
        </Link>
      </main>
    );
  const { id } = await params;
  const s = await prisma.settlementAgreement.findFirst({
    where: { id, applicationId, status: { not: "DRAFT" } },
    include: { application: { select: { applicationCode: true } } },
  });
  if (!s) notFound();
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <div className="mb-8 flex justify-between">
        <span className="font-bold">
          Penny<span className="text-green-700">Lime</span>
        </span>
        <Link href="/portal" className="text-sm text-green-700">
          Back to your account
        </Link>
      </div>
      <p className="text-xs uppercase tracking-widest text-green-700">
        {s.application.applicationCode}
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">
        Your settlement agreement
      </h1>
      <p className="mt-3 text-sm text-zinc-600">
        Review the agreement and every payment before signing. The settlement
        replaces your unpaid payment schedule when signed. Your previous
        agreement and payment history are retained.
      </p>
      <SettlementSigning
        agreement={{
          id: s.id,
          status: s.status,
          text: s.agreementText,
          achText: s.authorizationText,
          total: Number(s.total),
          schedule: JSON.parse(s.scheduleJson),
          expiresAt: s.expiresAt.toISOString(),
          signedName: s.signedName,
          signedAt: s.signedAt?.toISOString() ?? null,
          hash: s.agreementHash,
        }}
      />
    </main>
  );
}
