"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function AdminLoginPage() {
  const router = useRouter();
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
        router.push("/admin/dashboard");
      }
    } catch {
      setError("An unexpected error occurred");
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[#f8faf8] min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <span className="font-extrabold text-xl tracking-[-0.03em]">
            Penny<span className="text-[#15803d]">Lime</span>
          </span>
          <p className="mt-1 text-sm text-gray-400">Admin Portal</p>
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
