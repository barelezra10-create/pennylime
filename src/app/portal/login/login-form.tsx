"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "phone" | "code";

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testCode, setTestCode] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const r = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error || "Failed to send code");
      } else {
        setStep("code");
        if (data.testCode) setTestCode(String(data.testCode));
      }
    } catch {
      setError("Network error. Try again.");
    }
    setPending(false);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const r = await fetch("/api/portal/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error || "Invalid code");
        setPending(false);
        return;
      }
      router.push("/portal");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setPending(false);
    }
  }

  if (step === "phone") {
    return (
      <form onSubmit={sendCode} className="mt-6 space-y-3">
        <label className="block">
          <span className="text-[12px] font-semibold text-[#52525b]">Phone number</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            required
            autoFocus
            inputMode="tel"
            className="mt-1.5 w-full rounded-lg border border-[#e4e4e7] bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#15803d]"
          />
        </label>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={pending || !phone.trim()}
          className="w-full rounded-lg bg-[#15803d] hover:bg-[#166534] text-white text-sm font-semibold py-2.5 transition-colors disabled:opacity-60"
        >
          {pending ? "Sending code..." : "Send verification code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} className="mt-6 space-y-3">
      <div className="rounded-lg bg-[#f0fdf4] border border-[#dcfce7] p-3 text-[12px] text-[#15803d]">
        Code sent to <strong>{phone}</strong>.
        <button
          type="button"
          onClick={() => {
            setStep("phone");
            setCode("");
            setError(null);
          }}
          className="ml-2 underline font-semibold"
        >
          Change number
        </button>
      </div>
      {testCode ? (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          Test mode: code is <span className="font-mono font-bold">{testCode}</span>
        </p>
      ) : null}
      <label className="block">
        <span className="text-[12px] font-semibold text-[#52525b]">Verification code</span>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="123456"
          required
          autoFocus
          inputMode="numeric"
          maxLength={6}
          className="mt-1.5 w-full rounded-lg border border-[#e4e4e7] bg-white px-3.5 py-3 text-lg font-mono tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-[#15803d]"
        />
      </label>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={pending || code.length < 4}
        className="w-full rounded-lg bg-[#15803d] hover:bg-[#166534] text-white text-sm font-semibold py-2.5 transition-colors disabled:opacity-60"
      >
        {pending ? "Verifying..." : "Sign in"}
      </button>
    </form>
  );
}
