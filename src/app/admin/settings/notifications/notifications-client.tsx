"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import {
  saveNotificationConfig,
  sendTestNotification,
  type NotificationConfigState,
} from "@/actions/notifications";

type EventDef = {
  key: keyof NotificationConfigState;
  apiKey:
    | "chatStarted"
    | "applicationSubmitted"
    | "leadCreated"
    | "inboundEmail"
    | "paymentSettled"
    | "paymentFailed"
    | "paymentInitiated";
  title: string;
  description: string;
};

const EVENTS: EventDef[] = [
  {
    key: "leadCreatedEmails",
    apiKey: "leadCreated",
    title: "New lead",
    description: "A brand-new Contact was created from any source (funnel, chat, landing page form).",
  },
  {
    key: "chatStartedEmails",
    apiKey: "chatStarted",
    title: "New chat",
    description: "Someone opened the chat widget on pennylime.com and submitted their name + email.",
  },
  {
    key: "applicationSubmittedEmails",
    apiKey: "applicationSubmitted",
    title: "Application submitted",
    description: "A funnel applicant completed and submitted the application.",
  },
  {
    key: "inboundEmailEmails",
    apiKey: "inboundEmail",
    title: "Reply received",
    description: "A known Contact replied to one of our emails (info@pennylime.com). Requires the inbound webhook to be wired up.",
  },
  {
    key: "paymentSettledEmails",
    apiKey: "paymentSettled",
    title: "Payment settled",
    description: "An ACH debit posted and the Payment row flipped to PAID. Fires from both the Increase webhook and the payment-status cron poll.",
  },
  {
    key: "paymentFailedEmails",
    apiKey: "paymentFailed",
    title: "Payment failed",
    description: "An ACH debit returned (NSF / R-code) or the initiation itself was rejected. Highest priority of the three — pair with the Recharge button on the application.",
  },
  {
    key: "paymentInitiatedEmails",
    apiKey: "paymentInitiated",
    title: "Payment initiated",
    description: "The payment-processor cron just kicked off a fresh ACH debit. Useful for treasury / cash-flow tracking but can be noisy on heavy days.",
  },
];

export function NotificationsClient({ initial }: { initial: NotificationConfigState }) {
  const [state, setState] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    try {
      const r = await saveNotificationConfig(state);
      if (r.ok) toast.success("Notification settings saved");
      else toast.error(r.error);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(apiKey: EventDef["apiKey"]) {
    setTesting(apiKey);
    try {
      const r = await sendTestNotification(apiKey);
      if (r.ok) {
        toast.success(`Test sent to ${r.sent} recipient${r.sent === 1 ? "" : "s"}`);
      } else {
        toast.error(r.error);
      }
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Notifications"
        description="Send an email when something happens. Add one or more recipient emails per event — comma- or newline-separated."
      />

      <div className="space-y-5">
        {EVENTS.map((ev) => (
          <div key={ev.key} className="bg-white rounded-xl border border-[#e4e4e7] p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-[14px] font-bold text-black">{ev.title}</h3>
                <p className="text-[12px] text-[#71717a] mt-0.5">{ev.description}</p>
              </div>
              <button
                type="button"
                onClick={() => handleTest(ev.apiKey)}
                disabled={testing === ev.apiKey || !state[ev.key].trim()}
                className="text-[11px] font-semibold rounded-lg px-3 py-1.5 bg-[#f4f4f5] text-[#52525b] hover:bg-[#e4e4e7] disabled:opacity-40 whitespace-nowrap"
              >
                {testing === ev.apiKey ? "Sending…" : "Send test"}
              </button>
            </div>
            <textarea
              value={state[ev.key]}
              onChange={(e) => setState({ ...state, [ev.key]: e.target.value })}
              placeholder="bar@albert-capital.com, info@pennylime.com"
              rows={2}
              className="w-full text-[13px] px-3.5 py-2.5 bg-[#fafafa] border border-[#e4e4e7] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803d]/20 font-mono"
            />
            <p className="text-[10px] text-[#a1a1aa] mt-1.5">
              {state[ev.key].split(/[,\n]/).map((s) => s.trim()).filter(Boolean).length} recipient(s).
              Leave empty to disable this notification.
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#15803d] text-white text-[13px] font-semibold rounded-xl px-6 py-2.5 hover:bg-[#166534] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>

      <p className="mt-6 text-[11px] text-[#a1a1aa]">
        All emails are sent from <code className="bg-[#f4f4f5] px-1 rounded">notifications@pennylime.com</code>{" "}
        with replies routed to <code className="bg-[#f4f4f5] px-1 rounded">info@pennylime.com</code>.
        Notifications fail silently — they never block the underlying customer action.
      </p>
    </div>
  );
}
