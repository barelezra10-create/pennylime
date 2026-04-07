import { getApplicationByCode } from "@/actions/applications";
import { StatusDisplay } from "@/components/status-display";
import Link from "next/link";

export const metadata = {
  title: "Application Status | PennyLime",
};

export default async function StatusByCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const application = await getApplicationByCode(code);

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#f8faf8] px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">
          Application Status
        </h1>
      </div>
      <div className="w-full max-w-md">
        {application ? (
          <StatusDisplay
            application={{
              ...application,
              loanAmount: Number(application.loanAmount),
            }}
          />
        ) : (
          <div className="rounded-xl bg-white px-6 py-8 text-center shadow-sm">
            <p className="text-[15px] text-[#71717a]">
              Application not found. Please check your code and try again.
            </p>
          </div>
        )}
        <div className="mt-4 text-center">
          <Link
            href="/status"
            className="text-[14px] text-[#15803d] hover:underline"
          >
            Look up another application
          </Link>
        </div>
      </div>
    </div>
  );
}
