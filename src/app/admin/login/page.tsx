"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
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
        window.location.href = "/admin/dashboard";
        return;
      }
    } catch {
      setError("An unexpected error occurred");
      toast.error("An unexpected error occurred");
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
