import type { ReactNode } from "react";

export const metadata = { title: "PennyLime Partner View" };

export default function PartnersLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fafaf7] text-[#0a0a0a]">
      {children}
    </div>
  );
}
