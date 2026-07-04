import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AdminTopNav } from "@/components/admin/top-nav";
import { CommandPalette } from "@/components/admin/command-palette";
import { DialerProvider } from "@/components/admin/dialer/dialer-provider";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <>{children}</>;
  }

  return (
    <DialerProvider>
      <div className="min-h-screen bg-[#f8f8f6]">
        <AdminTopNav userName={session.user?.name || session.user?.email || "Admin"} />
        <CommandPalette />
        <main className="p-6 lg:p-8 max-w-[1400px] mx-auto">{children}</main>
      </div>
    </DialerProvider>
  );
}
