"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { sendSmsToContact } from "@/actions/sms";

type SmsThreadMessage = {
  id: string;
  toNumber: string;
  fromNumber: string;
  body: string;
  status: string;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

/** Last 10 digits, so "+15551234567" matches "(555) 123-4567". */
function tenDigits(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

function StatusTicks({ status, errorMessage }: { status: string; errorMessage: string | null }) {
  if (status === "failed" || status === "undelivered") {
    return (
      <span
        className="text-[10px] font-semibold text-[#fca5a5]"
        title={errorMessage || "Delivery failed"}
      >
        ✗ failed
      </span>
    );
  }
  if (status === "delivered") {
    return <span className="text-[10px] text-white/70" title="Delivered">✓✓</span>;
  }
  if (status === "sent" || status === "queued" || status === "accepted" || status === "sending") {
    return <span className="text-[10px] text-white/70" title="Sent">✓</span>;
  }
  return <span className="text-[10px] text-white/70">{status}</span>;
}

/**
 * SMS conversation for a contact — WhatsApp-style bubbles.
 * Outbound = messages we sent TO the contact's phone (toNumber matches
 * their number); everything else (inbound webhook rows) renders on the
 * left. Polls every 10s so replies show up without a manual refresh.
 */
export function SmsThread({
  contactId,
  contactPhone,
  smsOptIn,
  smsOptOutAt,
}: {
  contactId: string;
  contactPhone: string | null;
  smsOptIn: boolean;
  smsOptOutAt: string | null;
}) {
  const [messages, setMessages] = useState<SmsThreadMessage[] | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  const optedOut = !smsOptIn || !!smsOptOutAt;
  const contactTen = tenDigits(contactPhone);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/sms/thread?contactId=${encodeURIComponent(contactId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { messages: SmsThreadMessage[] };
      setMessages(data.messages);
    } catch {
      /* keep the last good thread on transient errors */
    }
  }, [contactId]);

  useEffect(() => {
    setMessages(null);
    void refresh();
    const handle = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh();
    }, 10_000);
    return () => clearInterval(handle);
  }, [refresh]);

  // Scroll to the newest message when the thread grows.
  useEffect(() => {
    if (!messages) return;
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages]);

  async function handleSend() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.set("contactId", contactId);
      formData.set("body", text);
      const r = await sendSmsToContact(formData);
      if (r.ok) {
        toast.success("SMS sent");
        setBody("");
        await refresh();
      } else {
        toast.error(r.error || "Send failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-bold text-black uppercase tracking-[0.05em]">
          SMS conversation
        </h3>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-[11px] font-semibold text-[#15803d] hover:underline"
        >
          Refresh
        </button>
      </div>

      <div ref={scrollRef} className="max-h-[360px] overflow-y-auto pr-1 mb-4 space-y-2">
        {messages === null ? (
          <p className="text-[12px] text-[#a1a1aa]">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-[12px] text-[#a1a1aa]">
            No SMS yet. {contactPhone ? "Send one below to start the conversation." : "Contact has no phone number."}
          </p>
        ) : (
          messages.map((m) => {
            const outbound = contactTen
              ? tenDigits(m.toNumber) === contactTen
              : tenDigits(m.fromNumber) !== contactTen;
            return (
              <div key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                    outbound
                      ? "bg-[#15803d] text-white rounded-br-md"
                      : "bg-[#f4f4f5] text-[#18181b] rounded-bl-md"
                  }`}
                >
                  <p className="text-[13px] whitespace-pre-wrap break-words">{m.body}</p>
                  <div className={`mt-1 flex items-center gap-1.5 ${outbound ? "justify-end" : ""}`}>
                    <span className={`text-[10px] ${outbound ? "text-white/70" : "text-[#a1a1aa]"}`}>
                      {new Date(m.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    {outbound && <StatusTicks status={m.status} errorMessage={m.errorMessage} />}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {optedOut ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
          This contact opted out of SMS
          {smsOptOutAt ? ` on ${new Date(smsOptOutAt).toLocaleDateString()}` : ""}. Sending is
          disabled until they text START to re-subscribe.
        </div>
      ) : (
        <div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={2}
            placeholder={contactPhone ? `Text ${contactPhone}...` : "Contact has no phone number"}
            disabled={!contactPhone || sending}
            className="w-full text-[13px] px-3.5 py-2.5 bg-[#f4f4f5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803d]/20 resize-none disabled:opacity-50"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-[#a1a1aa]">Enter to send · Shift+Enter for a new line</span>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || !body.trim() || !contactPhone}
              className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-xl hover:bg-[#166534] disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
