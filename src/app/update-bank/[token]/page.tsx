import { verifyBankUpdateToken } from "@/lib/bank-update-token";
import { prisma } from "@/lib/db";
import { BankUpdateClient } from "./bank-update-client";

export const dynamic = "force-dynamic";

export default async function UpdateBankPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const applicationId = verifyBankUpdateToken(token);

  let firstName: string | null = null;
  let valid = false;
  if (applicationId) {
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { firstName: true },
    });
    if (app) {
      valid = true;
      firstName = app.firstName;
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f8f6] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <span className="text-[20px] font-extrabold tracking-[-0.03em]">
            Penny<span className="text-[#15803d]">Lime</span>
          </span>
        </div>
        {!valid ? (
          <div className="bg-white rounded-2xl border border-[#e4e4e7] p-8 text-center">
            <h1 className="text-[18px] font-bold text-black mb-2">Link expired</h1>
            <p className="text-[14px] text-[#71717a]">
              This bank-update link is invalid or has expired. Please contact PennyLime support to get a new one.
            </p>
          </div>
        ) : (
          <BankUpdateClient token={token} applicationId={applicationId!} firstName={firstName || "there"} />
        )}
      </div>
    </div>
  );
}
