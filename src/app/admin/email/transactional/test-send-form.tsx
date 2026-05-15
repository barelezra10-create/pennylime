"use client";

import { useState } from "react";
import { sendAllTransactionalTests } from "@/actions/transactional-test";

export function TestSendForm() {
  const [email, setEmail] = useState("barelezra10@gmail.com");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const r = await sendAllTransactionalTests(email);
    setBusy(false);
    if (!r.ok) {
      setResult(`Failed: ${r.error}`);
    } else {
      const failed = (r.results ?? []).filter((x) => !x.ok);
      setResult(
        failed.length === 0
          ? `Sent ${r.sent}/${r.total} test emails to ${email}.`
          : `Sent ${r.sent}/${r.total}. Failures: ${failed.map((f) => f.name).join(", ")}`,
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="bg-white rounded-xl border border-[#e4e4e7] p-5 mb-6 flex items-end gap-3">
      <div className="flex-1">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa] mb-1">
          Send all as test to
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 border border-[#e4e4e7] rounded-lg text-[13px] focus:outline-none focus:border-[#15803d]"
          required
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 bg-[#15803d] text-white rounded-lg text-[13px] font-semibold hover:bg-[#166534] disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send all tests"}
      </button>
      {result && (
        <p className="text-[12px] text-[#71717a] ml-2 max-w-[320px]">{result}</p>
      )}
    </form>
  );
}
