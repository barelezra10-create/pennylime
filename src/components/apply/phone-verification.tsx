"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Props = {
  phone: string;
  contactId?: string;
  onVerified: () => void;
  onCancel?: () => void;
};

export function PhoneVerification({ phone, contactId, onVerified, onCancel }: Props) {
  const [step, setStep] = useState<"send" | "code">("send");
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [testCode, setTestCode] = useState<string | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function handleSend() {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/verify/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, contactId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Failed to send code");
      } else {
        setStep("code");
        setResendIn(30);
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
        if (data.testCode) {
          setTestCode(data.testCode);
          toast.success(`Test mode: code is ${data.testCode}`, { duration: 8000 });
        } else {
          toast.success(`Code sent to ${phone}`);
        }
      }
    } finally {
      setSending(false);
    }
  }

  async function handleCheck(fullCode?: string) {
    const finalCode = fullCode ?? code.join("");
    if (!/^\d{6}$/.test(finalCode)) return;
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/verify/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, code: finalCode, contactId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error + (data.attemptsLeft != null ? ` (${data.attemptsLeft} attempts left)` : ""));
        setCode(["", "", "", "", "", ""]);
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
      } else {
        toast.success("Phone verified");
        onVerified();
      }
    } finally {
      setChecking(false);
    }
  }

  function handleDigit(idx: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    if (digit && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
    if (next.every((d) => d) && next.join("").length === 6) {
      handleCheck(next.join(""));
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = pasted.split("").concat(Array(6 - pasted.length).fill(""));
    setCode(next.slice(0, 6));
    if (pasted.length === 6) handleCheck(pasted);
    else inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  return (
    <div className="bg-white border border-[#e4e4e7] rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[#f0fdf4] flex items-center justify-center text-[#15803d] text-lg">
          ✓
        </div>
        <div>
          <h3 className="text-[16px] font-bold text-black">Verify your phone number</h3>
          <p className="text-[12px] text-[#71717a] mt-0.5">
            We&apos;ll text a 6-digit code to <strong className="text-black">{phone}</strong>
          </p>
        </div>
      </div>

      {step === "send" && (
        <div className="space-y-4">
          <p className="text-[13px] text-[#71717a]">
            By tapping &quot;Send code&quot; you agree to receive an automated SMS from PennyLime.
            Standard message and data rates may apply. Reply STOP to opt out.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="flex-1 bg-[#15803d] text-white font-semibold rounded-xl py-3 text-[14px] hover:bg-[#166534] disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send code"}
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-3 text-[13px] text-[#71717a] hover:text-black"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {step === "code" && (
        <div className="space-y-4">
          {testCode && (
            <div className="bg-[#fffbeb] border border-[#f59e0b] rounded-xl p-3 text-[12px]">
              <div className="font-semibold text-[#92400e] mb-1">⚠ Test mode (Twilio not configured)</div>
              <div className="text-[#78350f]">
                Use code <code className="bg-white border border-[#fbbf24] rounded px-1.5 py-0.5 font-mono font-bold tracking-widest">{testCode}</code> to verify. In production, this code is texted to the user instead of shown.
              </div>
              <button
                type="button"
                onClick={() => {
                  const digits = testCode.split("");
                  setCode(digits);
                  handleCheck(testCode);
                }}
                className="mt-2 text-[11px] underline text-[#92400e] hover:text-[#78350f]"
              >
                Auto-fill and verify
              </button>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            {code.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                type="tel"
                inputMode="numeric"
                pattern="[0-9]"
                maxLength={1}
                value={d}
                onChange={(e) => handleDigit(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                className="w-11 h-12 text-center text-[20px] font-bold border border-[#e4e4e7] rounded-xl focus:outline-none focus:border-[#15803d] focus:ring-2 focus:ring-[#15803d]/20"
              />
            ))}
          </div>

          {error && <p className="text-[12px] text-[#dc2626]">{error}</p>}

          <div className="flex items-center justify-between text-[12px]">
            <button
              type="button"
              onClick={() => setStep("send")}
              className="text-[#71717a] hover:text-black"
            >
              Wrong number?
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || resendIn > 0}
              className="text-[#15803d] font-semibold disabled:text-[#a1a1aa]"
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </button>
          </div>

          {checking && <p className="text-[12px] text-[#71717a] text-center">Verifying…</p>}
        </div>
      )}
    </div>
  );
}
