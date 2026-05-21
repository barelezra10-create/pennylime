import { redirect } from "next/navigation";
import { isPartnerAuthed } from "@/lib/partner-auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function PartnerLoginPage() {
  if (await isPartnerAuthed()) {
    redirect("/partners");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-10 justify-center">
          <span className="text-2xl font-bold tracking-tight">
            Penny<span className="text-[#15803d]">Lime<span className="text-[#a3e635]">.</span></span>
          </span>
        </div>
        <div className="bg-white rounded-2xl border border-[#e4e4e7] shadow-sm p-8">
          <h1 className="text-lg font-semibold text-center">Partner access</h1>
          <p className="mt-1.5 text-[13px] text-[#71717a] text-center">
            Enter the access code to view the partner dashboard.
          </p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
