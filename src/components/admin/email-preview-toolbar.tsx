"use client";

import { useState } from "react";
import { toast } from "sonner";
import { sendTestEmail } from "@/actions/email";

// Sample values used for both preview and test send. Mirrors the substitution
// list in /api/cron/email-processor and src/actions/email.ts (sendTestEmail).
const SAMPLE_VARS: Record<string, string> = {
  firstName: "Sample",
  lastName: "Applicant",
  email: "preview@example.com",
  loanAmount: "5,000",
  applicationCode: "TESTCODE",
  minAmount: "1,000",
  maxAmount: "5,000",
  offerLink: "https://pennylime.com/offer/TESTCODE?t=preview",
};

function substitute(text: string) {
  return text.replace(/\{(\w+)\}/g, (_, key) =>
    SAMPLE_VARS[key] != null ? SAMPLE_VARS[key] : `{${key}}`,
  );
}

export function EmailPreviewToolbar({
  subject,
  body,
}: {
  subject: string;
  body: string;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);

  const renderedSubject = substitute(subject || "(empty subject)");
  const renderedBody = substitute(body || "<p style=\"color:#a1a1aa\">(empty body)</p>");

  async function handleSend() {
    if (!testEmail.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body must be set before sending a test");
      return;
    }
    setSending(true);
    try {
      const r = await sendTestEmail({ to: testEmail, subject, body });
      if (r.ok) {
        toast.success(`Test sent to ${testEmail}`);
        setTestOpen(false);
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e4e7] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0a0a0a] hover:bg-[#fafafa]"
        >
          👁 View email
        </button>
        {!testOpen ? (
          <button
            type="button"
            onClick={() => setTestOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803d] text-white px-3 py-1.5 text-[12px] font-semibold hover:bg-[#166534]"
          >
            ✉ Send test
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-[#f0fdf4] border border-[#dcfce7] px-3 py-1.5">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-white rounded px-2.5 py-1 text-[12px] border border-[#dcfce7] focus:outline-none focus:ring-1 focus:ring-[#15803d]/40"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="rounded bg-[#15803d] text-white px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50 hover:bg-[#166534]"
            >
              {sending ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => setTestOpen(false)}
              className="text-[12px] text-[#71717a] hover:text-black"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            style={{ maxHeight: "85vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[#e4e4e7]">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.06em] text-[#71717a] font-semibold">
                  Subject preview
                </p>
                <p className="mt-1 text-[15px] font-bold text-[#0a0a0a] truncate" title={renderedSubject}>
                  {renderedSubject}
                </p>
                <p className="mt-1 text-[11px] text-[#a1a1aa]">
                  Sample values are substituted (firstName=Sample, loanAmount=5,000, etc.).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="flex-shrink-0 text-[#71717a] hover:text-black text-xl leading-none"
              >
                ×
              </button>
            </div>
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={renderedBody}
              className="flex-1 w-full bg-white"
              style={{ border: 0, minHeight: "500px" }}
            />
          </div>
        </div>
      )}
    </>
  );
}
