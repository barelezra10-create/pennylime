import { StatusChecker } from "@/components/status-checker";

export const metadata = {
  title: "Check Application Status | PennyLime",
};

export default function StatusPage() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-[#f8faf8] px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">
          Check Application Status
        </h1>
        <p className="mt-1 text-[15px] text-[#71717a]">
          Enter your application code to check the status
        </p>
      </div>
      <StatusChecker />
    </div>
  );
}
