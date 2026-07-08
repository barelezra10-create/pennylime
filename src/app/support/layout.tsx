import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SupportSignOut } from "./support-sign-out";

export default async function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <>{children}</>;
  }

  const userName = session.user?.name || session.user?.email || "Agent";
  const userEmail = session.user?.email || "";

  return (
    <div className="min-h-screen bg-[#f8f8f6]">
      <header className="sticky top-0 z-30 bg-white border-b border-[#e4e4e7]">
        <div className="px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-extrabold tracking-[-0.03em]">
                Penny<span className="text-[#15803d]">Lime</span>
              </span>
              <span className="text-[10px] uppercase tracking-[0.1em] text-[#15803d] font-semibold">
                Support
              </span>
            </div>
            <div className="flex items-center gap-3 text-[12px] text-[#71717a]">
              <span className="hidden sm:inline">
                {userName !== userEmail ? (
                  <>
                    <span className="text-[#0a0a0a] font-medium">{userName}</span>
                    {" "}
                    <span className="text-[#a1a1aa]">{userEmail}</span>
                  </>
                ) : (
                  <span className="text-[#0a0a0a] font-medium">{userEmail}</span>
                )}
              </span>
              <SupportSignOut />
            </div>
          </div>
        </div>
      </header>
      <main className="p-4 lg:p-6 max-w-[1400px] mx-auto">{children}</main>
    </div>
  );
}
