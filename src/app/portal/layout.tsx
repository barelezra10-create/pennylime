import type { ReactNode } from "react";

export const metadata = {
  title: "PennyLime · Your Account",
  description: "Track your PennyLime cash advance, view your repayment schedule, and download your contract.",
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fafaf7] text-[#0a0a0a]">
      {children}
    </div>
  );
}
