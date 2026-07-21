"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendCrmEmail, getCrmEmailTemplates, polishReplyWithAI } from "@/actions/crm-email";
import type { CrmEmailTemplate } from "@/actions/crm-email";
import { sendSmsToContact } from "@/actions/sms";

type Channel = "email" | "sms";

const inputClass =
  "w-full rounded-xl border border-[#e4e4e7] bg-white px-3.5 py-2.5 text-[13px] text-black focus:outline-none focus:ring-2 focus:ring-[#15803d]/20 focus:border-[#15803d] placeholder:text-[#a1a1aa]";

const SMS_MAX = 320;

export function CustomerCommunication({
  contactId,
  email,
  phone,
}: {
  contactId: string;
  email: string | null;
  phone: string | null;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>("email");

  /* Email state */
  const [templates, setTemplates] = useState<CrmEmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  /* AI polish state */
  const [aiNotes, setAiNotes] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [showAiPolish, setShowAiPolish] = useState(false);

  /* SMS state */
  const [smsBody, setSmsBody] = useState("");
  const [sendingSms, setSendingSms] = useState(false);

  useEffect(() => {
    getCrmEmailTemplates().then(setTemplates).catch(() => null);
  }, []);

  function applyTemplate(id: string) {
    setSelectedTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setEmailBody(t.body);
  }

  async function handlePolishWithAI() {
    if (!aiNotes.trim()) {
      toast.error("Write a few words first, then I can polish them.");
      return;
    }
    setPolishing(true);
    const tid = toast.loading("Polishing with Gemini...");
    try {
      const r = await polishReplyWithAI({ contactId, draftNotes: aiNotes });
      if (r.ok) {
        setSubject(r.subject);
        setEmailBody(r.body);
        setAiNotes("");
        toast.success("Polished. Review before sending.", { id: tid });
      } else {
        toast.error(r.error, { id: tid });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Polish failed", { id: tid });
    } finally {
      setPolishing(false);
    }
  }

  async function handleSendEmail() {
    if (!subject.trim() || !emailBody.trim()) {
      toast.error("Subject and body are required");
      return;
    }
    setSendingEmail(true);
    try {
      const r = await sendCrmEmail({ contactId, subject, body: emailBody });
      if (r.ok) {
        toast.success(`Email sent to ${email}`);
        setSelectedTemplateId("");
        setSubject("");
        setEmailBody("");
        setAiNotes("");
        setShowAiPolish(false);
        router.refresh();
      } else {
        toast.error(r.error ?? "Failed to send email");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleSendSms() {
    if (!smsBody.trim()) {
      toast.error("Message body is required");
      return;
    }
    setSendingSms(true);
    try {
      const fd = new FormData();
      fd.append("contactId", contactId);
      fd.append("body", smsBody);
      const r = await sendSmsToContact(fd);
      if (r.ok) {
        toast.success(`SMS sent to ${phone}`);
        setSmsBody("");
        router.refresh();
      } else {
        toast.error(r.error ?? "Failed to send SMS");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send SMS");
    } finally {
      setSendingSms(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-5">
      {/* Card header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[14px] font-bold tracking-[-0.02em] text-black flex items-center gap-2">
          <svg
            className="h-4 w-4 text-[#a1a1aa]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
            />
          </svg>
          Message borrower
        </h2>

        {/* Channel pill toggle */}
        <div className="flex items-center rounded-lg border border-[#e4e4e7] bg-[#f4f4f5] p-0.5 gap-0.5">
          <button
            type="button"
            onClick={() => setChannel("email")}
            className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-colors ${
              channel === "email"
                ? "bg-white text-[#15803d] shadow-sm border border-[#e4e4e7]"
                : "text-[#71717a] hover:text-black"
            }`}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => setChannel("sms")}
            className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-colors ${
              channel === "sms"
                ? "bg-white text-[#15803d] shadow-sm border border-[#e4e4e7]"
                : "text-[#71717a] hover:text-black"
            }`}
          >
            Text
          </button>
        </div>
      </div>

      {/* To: line */}
      <p className="text-[11px] text-[#a1a1aa] mb-3">
        To:{" "}
        <span className="font-medium text-[#52525b]">
          {channel === "email"
            ? email ?? "no email on file"
            : phone ?? "no phone on file"}
        </span>
      </p>

      {/* ── Email mode ── */}
      {channel === "email" && (
        <div className="space-y-3">
          {!email && (
            <p className="text-[12px] text-[#b45309] bg-[#fef9ec] border border-[#fde68a] rounded-lg px-3 py-2">
              No email on file for this contact.
            </p>
          )}

          {/* Template selector */}
          {templates.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-[#71717a] uppercase tracking-[0.05em] mb-1">
                Template
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className={inputClass}
                disabled={!email}
              >
                <option value="">Use a template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="block text-[11px] font-semibold text-[#71717a] uppercase tracking-[0.05em] mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className={inputClass}
              disabled={!email}
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-[11px] font-semibold text-[#71717a] uppercase tracking-[0.05em] mb-1">
              Body
            </label>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Write your message..."
              rows={5}
              className={`${inputClass} resize-none leading-relaxed`}
              disabled={!email}
            />
          </div>

          {/* AI polish toggle */}
          {email && (
            <div>
              <button
                type="button"
                onClick={() => setShowAiPolish((v) => !v)}
                className="text-[11px] text-[#15803d] font-semibold hover:underline"
              >
                {showAiPolish ? "Hide AI polish" : "AI polish"}
              </button>
              {showAiPolish && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={aiNotes}
                    onChange={(e) => setAiNotes(e.target.value)}
                    placeholder='e.g. "approved 1500, send link"'
                    className={`${inputClass} flex-1`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handlePolishWithAI();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handlePolishWithAI}
                    disabled={polishing}
                    className="shrink-0 rounded-xl border border-[#e4e4e7] bg-[#f4f4f5] px-3 py-2 text-[12px] font-semibold text-[#15803d] hover:bg-[#f0fdf4] disabled:opacity-50 transition-colors"
                  >
                    {polishing ? "Polishing..." : "Polish"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Send */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSendEmail}
              disabled={sendingEmail || !email}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#15803d] text-white text-[12px] font-semibold px-4 py-2 hover:bg-[#166534] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sendingEmail ? "Sending..." : "Send email"}
            </button>
          </div>
        </div>
      )}

      {/* ── SMS mode ── */}
      {channel === "sms" && (
        <div className="space-y-3">
          {!phone && (
            <p className="text-[12px] text-[#b45309] bg-[#fef9ec] border border-[#fde68a] rounded-lg px-3 py-2">
              No phone on file for this contact.
            </p>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-semibold text-[#71717a] uppercase tracking-[0.05em]">
                Message
              </label>
              <span
                className={`text-[11px] tabular-nums ${
                  smsBody.length > SMS_MAX ? "text-[#dc2626] font-semibold" : "text-[#a1a1aa]"
                }`}
              >
                {smsBody.length} / {SMS_MAX}
              </span>
            </div>
            <textarea
              value={smsBody}
              onChange={(e) => setSmsBody(e.target.value)}
              placeholder="Write your text message..."
              rows={4}
              maxLength={SMS_MAX}
              className={`${inputClass} resize-none leading-relaxed`}
              disabled={!phone}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSendSms}
              disabled={sendingSms || !phone || smsBody.length > SMS_MAX}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#15803d] text-white text-[12px] font-semibold px-4 py-2 hover:bg-[#166534] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sendingSms ? "Sending..." : "Send text"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
