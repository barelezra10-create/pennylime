"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  sendCrmEmail,
  getCrmEmailTemplates,
  getRecentEmailsForContact,
  polishReplyWithAI,
  getEmailThread,
  type CrmEmailTemplate,
} from "@/actions/crm-email";

type EmailThreadItem = {
  id: string;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
  performedBy: string | null;
  createdAt: string;
};

/**
 * Email send form + conversation thread for a contact. Extracted from
 * the contact detail's Email tab so the application view and the
 * contact view render the exact same panel.
 */
export function EmailPanel({ contactId, contactEmail }: { contactId: string; contactEmail: string }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<CrmEmailTemplate[]>([]);
  const [recentEmails, setRecentEmails] = useState<Array<{ id: string; subject: string | null; type: string; createdAt: Date }>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [aiNotes, setAiNotes] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [thread, setThread] = useState<EmailThreadItem[]>([]);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);

  void recentEmails; // fetched for parity with the original tab; thread below is the visible history

  async function refreshThread() {
    try {
      const t = await getEmailThread(contactId);
      setThread(t);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refreshThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  async function handlePolishWithAI() {
    if (!aiNotes.trim()) {
      toast.error("Write a few words first, then I can polish them.");
      return;
    }
    setPolishing(true);
    const t = toast.loading("Polishing reply with Gemini…");
    try {
      const r = await polishReplyWithAI({ contactId, draftNotes: aiNotes });
      if (r.ok) {
        setSubject(r.subject);
        setBody(r.body);
        toast.success("Polished. Review before sending.", { id: t });
        // Clear the rough notes so the next polish round is fresh.
        setAiNotes("");
      } else {
        toast.error(r.error, { id: t });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Polish failed", { id: t });
    } finally {
      setPolishing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [tpls, recents] = await Promise.all([
        getCrmEmailTemplates(),
        getRecentEmailsForContact(contactId),
      ]);
      if (cancelled) return;
      setTemplates(tpls);
      setRecentEmails(recents);
    })();
    return () => { cancelled = true; };
  }, [contactId]);

  function applyTemplate(id: string) {
    setSelectedTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setBody(t.body);
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body required");
      return;
    }
    setSending(true);
    try {
      const r = await sendCrmEmail({ contactId, subject, body });
      if (r.ok) {
        toast.success(`Email sent to ${contactEmail}`);
        setSelectedTemplateId("");
        setSubject("");
        setBody("");
        const recents = await getRecentEmailsForContact(contactId);
        setRecentEmails(recents);
        await refreshThread();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-4">
        <div className="bg-white rounded-xl p-6 border border-[#e4e4e7]">
          <h2 className="text-[13px] font-bold text-black mb-4 uppercase tracking-[0.05em]">
            Send Email
          </h2>
          <p className="text-[12px] text-[#71717a] mb-4">
            From <code className="bg-[#f4f4f5] px-1 rounded">notifications@pennylime.com</code>{" "}
            · Reply-to <code className="bg-[#f4f4f5] px-1 rounded">info@pennylime.com</code>{" "}
            · To <strong className="text-black">{contactEmail}</strong>
          </p>

          <div className="mb-4">
            <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] mb-1.5 block">
              Template
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => applyTemplate(e.target.value)}
              className="w-full text-[13px] px-3.5 py-2.5 bg-[#f4f4f5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803d]/20"
            >
              <option value="">— Pick a template or start blank —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {selectedTemplate && (
              <p className="text-[11px] text-[#71717a] mt-1">{selectedTemplate.description}</p>
            )}
          </div>

          {/* AI polish — type rough notes, Gemini rewrites into a polished
              email body + subject. Pulls the customer's last inbound
              message for grounding so the reply matches the conversation. */}
          <div className="mb-4 rounded-xl border border-[#15803d]/30 bg-[#f0fdf4] p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#15803d]">
                ✦ Quick reply with AI
              </label>
              <span className="text-[10px] text-[#71717a]">Type a few words, Gemini polishes</span>
            </div>
            <textarea
              value={aiNotes}
              onChange={(e) => setAiNotes(e.target.value)}
              rows={2}
              placeholder='e.g. "yes approved 1500, send the offer link" or "ask him to upload bank statements"'
              className="w-full text-[13px] px-3.5 py-2.5 bg-white rounded-lg border border-[#15803d]/20 focus:outline-none focus:ring-2 focus:ring-[#15803d]/30 mb-2"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePolishWithAI}
                disabled={polishing || !aiNotes.trim()}
                className="rounded-lg bg-[#15803d] text-white text-[12px] font-semibold px-3.5 py-2 hover:bg-[#166534] disabled:opacity-50 transition-colors"
              >
                {polishing ? "Polishing…" : "✨ Polish with AI"}
              </button>
              <span className="text-[11px] text-[#71717a]">
                Reads the customer's last message + your notes, writes a clean reply.
              </span>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] mb-1.5 block">
              Subject
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className="w-full text-[13px] px-3.5 py-2.5 bg-[#f4f4f5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803d]/20"
            />
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">
                Body (HTML allowed)
              </label>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="text-[11px] font-semibold text-[#15803d] hover:underline"
              >
                {showPreview ? "Edit" : "Preview"}
              </button>
            </div>
            {showPreview ? (
              <div
                className="text-[13px] bg-white border border-[#e4e4e7] rounded-xl p-4 min-h-[200px] prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: body }}
              />
            ) : (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                placeholder="<p>Hi {{firstName}},</p>..."
                className="w-full text-[13px] px-3.5 py-2.5 bg-[#f4f4f5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803d]/20 font-mono"
              />
            )}
            <p className="text-[11px] text-[#71717a] mt-1">
              Vars: <code>{`{{firstName}}`}</code>, <code>{`{{lastName}}`}</code>,{" "}
              <code>{`{{applicationCode}}`}</code>, <code>{`{{loanAmount}}`}</code>,{" "}
              <code>{`{{email}}`}</code>, <code>{`{{phone}}`}</code>
            </p>
          </div>

          <button
            onClick={handleSend}
            disabled={sending}
            className="bg-[#15803d] text-white text-[13px] font-semibold rounded-xl px-5 py-2.5 hover:bg-[#166534] disabled:opacity-50"
          >
            {sending ? "Sending…" : `Send to ${contactEmail}`}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Email conversation — click any row to expand and read the
            full body. Inbound emails carry the customer's message
            (from Activity.details via the inbound-email webhook);
            outbound emails show what we sent. */}
        <div className="bg-white rounded-xl p-5 border border-[#e4e4e7]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-bold text-black uppercase tracking-[0.05em]">
              Email conversation
            </h3>
            <button
              type="button"
              onClick={refreshThread}
              className="text-[11px] font-semibold text-[#15803d] hover:underline"
            >
              Refresh
            </button>
          </div>

          {thread.length === 0 ? (
            <p className="text-[12px] text-[#a1a1aa]">No emails yet. Send one below to start the conversation.</p>
          ) : (
            <ul className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {thread.map((msg) => {
                const isInbound = msg.direction === "inbound";
                const isExpanded = expandedThreadId === msg.id;
                return (
                  <li
                    key={msg.id}
                    className={`rounded-lg border ${isInbound ? "bg-[#f7fbf8] border-[#dcfce7]" : "bg-[#fafafa] border-[#e4e4e7]"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedThreadId(isExpanded ? null : msg.id)}
                      className="w-full text-left p-3"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            isInbound
                              ? "bg-[#15803d] text-white"
                              : "bg-[#71717a] text-white"
                          }`}
                        >
                          {isInbound ? "↓ FROM CUSTOMER" : "↑ FROM YOU"}
                        </span>
                        <span className="text-[10px] text-[#a1a1aa] ml-auto">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-[12.5px] font-semibold text-[#0a0a0a] truncate" title={msg.subject}>
                        {msg.subject}
                      </p>
                      {!isExpanded && msg.body && (
                        <p className="text-[11.5px] text-[#71717a] mt-0.5 line-clamp-1">
                          {msg.body.replace(/<[^>]+>/g, " ").trim().slice(0, 90)}
                          {msg.body.length > 90 ? "…" : ""}
                        </p>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-[#f4f4f5]">
                        {msg.body ? (
                          /<[a-z][\s\S]*>/i.test(msg.body) ? (
                            <div
                              className="text-[12.5px] text-[#1a1a1a] leading-relaxed prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: msg.body }}
                            />
                          ) : (
                            <div className="text-[12.5px] text-[#1a1a1a] leading-relaxed whitespace-pre-wrap font-mono">
                              {msg.body}
                            </div>
                          )
                        ) : (
                          <p className="text-[11px] text-[#a1a1aa] italic">No body captured.</p>
                        )}
                        {isInbound && (
                          <button
                            type="button"
                            onClick={() => {
                              // Pre-fill subject as "Re: …" + scroll to top
                              setSubject(`Re: ${msg.subject.replace(/^Re:\s*/i, "")}`);
                              setExpandedThreadId(null);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[#15803d] hover:underline"
                          >
                            ↑ Reply
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
