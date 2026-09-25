"use client";

import { useState } from "react";
import { toast } from "sonner";
import { saveDailyRevenueRecipients, sendDailyRevenueReportNow } from "@/actions/daily-revenue";

export function RevenueReportRecipients({ initialRecipients, lastSentDate }: { initialRecipients: string; lastSentDate: string | null }) {
  const [recipients, setRecipients] = useState(initialRecipients);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const result = await saveDailyRevenueRecipients(recipients);
      if (result.ok) {
        setRecipients(result.recipients);
        toast.success("Daily report recipients saved");
      } else toast.error(result.error);
    } finally {
      setSaving(false);
    }
  }

  async function sendNow() {
    setSending(true);
    try {
      const saved = await saveDailyRevenueRecipients(recipients);
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }
      setRecipients(saved.recipients);
      const result = await sendDailyRevenueReportNow();
      if (result.ok) toast.success(`Report sent to ${result.sent} recipient${result.sent === 1 ? "" : "s"}`);
      else toast.error(result.error);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#e7e7e2] bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="font-semibold text-[#252520]">Daily email report</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#77776f]">Add one or more addresses, separated by commas or new lines. The existing payment status schedule sends the previous complete day’s report after midnight Eastern Time.</p>
        </div>
        {lastSentDate && <span className="text-xs text-[#85857e]">Last report sent for {lastSentDate}</span>}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs font-medium text-[#55554e]" htmlFor="daily-revenue-emails">
          Report recipients
          <textarea id="daily-revenue-emails" value={recipients} onChange={(event) => setRecipients(event.target.value)} rows={2} placeholder="finance@example.com, owner@example.com" className="mt-1 block w-full rounded-xl border border-[#e7e7e2] bg-[#fafaf8] px-3 py-2.5 text-sm font-normal text-[#252520] outline-none focus:border-emerald-600" />
        </label>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="rounded-lg border border-[#deded8] px-4 py-2.5 text-sm font-semibold text-[#44443e] hover:bg-[#f8f8f6] disabled:opacity-50">{saving ? "Saving…" : "Save recipients"}</button>
          <button onClick={sendNow} disabled={sending || !recipients.trim()} className="rounded-lg bg-[#15803d] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#166534] disabled:opacity-50">{sending ? "Sending…" : "Send today’s report"}</button>
        </div>
      </div>
    </section>
  );
}
