import { redirect } from "next/navigation";
import { getPortalApplicationId } from "@/lib/portal-auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function PortalLoginPage() {
  if (await getPortalApplicationId()) {
    redirect("/portal");
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
          <h1 className="text-lg font-semibold text-center">Sign in to your account</h1>
          <p className="mt-1.5 text-[13px] text-[#71717a] text-center">
            We'll text you a 6-digit code to verify your phone.
          </p>
          <LoginForm />
        </div>
        <p className="mt-5 text-center text-[12px] text-[#71717a]">
          New customer? <a href="/apply" className="font-semibold text-[#15803d] hover:underline">Apply for a cash advance →</a>
        </p>
      </div>
    </div>
  );
}
