"use client";

import { useState } from "react";
import {
  sendAllTransactionalTests,
  sendAllTransactionalSmsTests,
} from "@/actions/transactional-test";

export function TestSendForm() {
  const [email, setEmail] = useState("barelezra10@gmail.com");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<"email" | "sms" | null>(null);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [smsResult, setSmsResult] = useState<string | null>(null);

  async function sendEmails(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setEmailResult(null);
    const r = await sendAllTransactionalTests(email);
    setBusy(null);
    if (!r.ok) {
      setEmailResult(`Failed: ${r.error}`);
      return;
    }
    const failed = (r.results ?? []).filter((x) => !x.ok);
    setEmailResult(
      failed.length === 0
        ? `Sent ${r.sent}/${r.total} test emails to ${email}.`
        : `Sent ${r.sent}/${r.total}. Failures: ${failed.map((f) => f.name).join(", ")}`,
    );
  }

  async function sendSmses(e: React.FormEvent) {
    e.preventDefault();
    setBusy("sms");
    setSmsResult(null);
    const r = await sendAllTransactionalSmsTests(phone);
    setBusy(null);
    if (!r.ok) {
      setSmsResult(`Failed: ${r.error}`);
      return;
    }
    const failed = (r.results ?? []).filter((x) => !x.ok);
    setSmsResult(
      failed.length === 0
        ? `Sent ${r.sent}/${r.total} test SMS to ${phone}.`
        : `Sent ${r.sent}/${r.total}. Failures: ${failed.map((f) => `${f.name} (${f.error})`).join("; ")}`,
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      <form
        onSubmit={sendEmails}
        className="bg-white rounded-xl border border-[#e4e4e7] p-5"
      >
        <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa] mb-2">
          Send all emails as test to
        </label>
        <div className="flex items-end gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 px-3 py-2 border border-[#e4e4e7] rounded-lg text-[13px] focus:outline-none focus:border-[#15803d]"
            required
          />
          <button
            type="submit"
            disabled={busy !== null}
            className="px-4 py-2 bg-[#15803d] text-white rounded-lg text-[13px] font-semibold hover:bg-[#166534] disabled:opacity-50 whitespace-nowrap"
          >
            {busy === "email" ? "Sending…" : "Send emails"}
          </button>
        </div>
        {emailResult && (
          <p className="text-[12px] text-[#71717a] mt-3">{emailResult}</p>
        )}
      </form>

      <form
        onSubmit={sendSmses}
        className="bg-white rounded-xl border border-[#e4e4e7] p-5"
      >
        <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa] mb-2">
          Send all SMS as test to
        </label>
        <div className="flex items-end gap-3">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 123 4567"
            className="flex-1 px-3 py-2 border border-[#e4e4e7] rounded-lg text-[13px] focus:outline-none focus:border-[#15803d]"
            required
          />
          <button
            type="submit"
            disabled={busy !== null}
            className="px-4 py-2 bg-[#15803d] text-white rounded-lg text-[13px] font-semibold hover:bg-[#166534] disabled:opacity-50 whitespace-nowrap"
          >
            {busy === "sms" ? "Sending…" : "Send SMS"}
          </button>
        </div>
        {smsResult && (
          <p className="text-[12px] text-[#71717a] mt-3">{smsResult}</p>
        )}
      </form>
    </div>
  );
}
