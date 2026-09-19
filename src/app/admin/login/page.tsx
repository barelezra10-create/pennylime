"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { toast } from "sonner";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const optionsResponse = await fetch("/api/admin/mfa/options", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, enrollmentCode }),
      });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error);
      const assertion = options.mode === "register"
        ? await startRegistration({ optionsJSON: options.options })
        : options.mode === "authenticate" ? await startAuthentication({ optionsJSON: options.options }) : null;
      const result = await signIn("credentials", {
        email,
        challengeId: options.challengeId ?? "",
        assertion: assertion ? JSON.stringify(assertion) : "",
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
        toast.error("Invalid email or password");
      } else {
        // Full navigation (not router.push) so the shared /admin layout
        // re-runs server-side and picks up the new session — otherwise the
        // dashboard renders without the header/nav chrome until a manual
        // refresh (the layout doesn't re-render on client-side nav).
        // Full navigation refreshes the shared admin layout after sign-in.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/admin/dashboard";
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign-in could not be completed.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#fafaf7] min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-[#e4e4e7] p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lime-mark.svg" alt="" aria-hidden="true" width={56} height={56} className="mx-auto mb-3" />
          <span className="font-extrabold text-xl tracking-[-0.03em]">
            Penny<span className="text-[#15803d]">Lime<span className="text-[#15803d]">.</span></span>
          </span>
          <p className="mt-1 text-[12px] text-[#71717a] uppercase tracking-[0.06em] font-semibold">Admin Portal</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.05em] text-gray-500"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="admin@pennylime.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-[10px] border border-gray-200 bg-white px-4 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-300 outline-none transition-all focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.05em] text-gray-500"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-[10px] border border-gray-200 bg-white px-4 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-300 outline-none transition-all focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
            />
          </div>

          <details className="text-sm text-gray-600">
            <summary className="cursor-pointer">First-time passkey setup</summary>
            <p className="mt-2">Use the enrollment code your security administrator provided. Then follow your device&apos;s prompt to create a passkey.</p>
            <label htmlFor="enrollmentCode" className="block mt-3">Enrollment code</label>
            <input id="enrollmentCode" type="password" autoComplete="off" value={enrollmentCode}
              onChange={e => setEnrollmentCode(e.target.value)} className="mt-1 w-full rounded-lg border p-2" />
          </details>
          <p className="text-xs text-gray-500">Enrolled accounts also verify a passkey or security key when signing in.</p>
          {/* Error */}
          {error && (
            <p className="text-[13px] text-[#dc2626]">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="bg-[#1a1a1a] text-white rounded-lg py-3.5 font-semibold text-sm w-full transition-opacity disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
