"use client";

import { useEffect, useState } from "react";
import { getInboxBadges } from "@/actions/inbox-badges";
import { countOpenTickets } from "@/actions/tickets";
import { ChatsClient } from "@/app/admin/chats/chats-client";
import { EmailsPanel } from "@/app/support/emails-panel";
import { useDialer } from "@/components/admin/dialer/dialer-provider";
import { CollectionsPanel } from "./collections-panel";
import { TicketsPanel } from "@/app/support/tickets-panel";

type Tab = "active" | "collections" | "chats" | "emails" | "tickets";

const TABS: { key: Tab; label: string }[] = [
  { key: "active", label: "Active clients" },
  { key: "collections", label: "Collections" },
  { key: "chats", label: "Chats" },
  { key: "emails", label: "Emails" },
  { key: "tickets", label: "Tickets" },
];

export function SupportShell({ me, canManage }: { me: string | null; canManage: boolean }) {
  const { incomingEnabled, setIncomingEnabled, state: phoneState } = useDialer();
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("active");
  const [pendingChats, setPendingChats] = useState(0);
  const [unrepliedEmails, setUnrepliedEmails] = useState(0);
  const [openTickets, setOpenTickets] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [badges, ticketCount] = await Promise.all([
          getInboxBadges(),
          countOpenTickets(),
        ]);
        if (cancelled) return;
        setPendingChats(badges.pendingChats);
        setUnrepliedEmails(badges.unrepliedEmails);
        setOpenTickets(ticketCount);
      } catch {
        /* swallow */
      }
    }

    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div><p className="text-sm font-semibold">Support line: <a href="tel:+18886912706">+1 (888) 691-2706</a></p>
          <p className="mt-1 text-xs text-zinc-500">{incomingEnabled ? (phoneState.phase === "idle" ? "Ready for incoming calls. Keep this tab open with sound on." : "Incoming calls enabled. Finish the current call and notes to receive the next call.") : "Enable incoming calls to answer clients in this browser. Unanswered calls go to voicemail."}</p>
          {phoneError && <p role="alert" className="mt-1 text-xs text-red-700">{phoneError}</p>}
        </div>
        <button disabled={phoneBusy} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={async () => {
          setPhoneBusy(true); setPhoneError("");
          try { await setIncomingEnabled(!incomingEnabled); } catch (err) { setPhoneError(err instanceof Error ? err.message : "Could not connect the phone."); }
          finally { setPhoneBusy(false); }
        }}>{phoneBusy ? "Connecting…" : incomingEnabled ? "Go offline" : "Enable incoming calls"}</button>
      </div>
      {/* Counter chips */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#e4e4e7] text-[12px] font-semibold text-[#0a0a0a]">
          <span
            className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold leading-none ${
              pendingChats > 0 ? "bg-[#dc2626] text-white" : "bg-[#e4e4e7] text-[#71717a]"
            }`}
          >
            {pendingChats}
          </span>
          Chats waiting
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#e4e4e7] text-[12px] font-semibold text-[#0a0a0a]">
          <span
            className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold leading-none ${
              unrepliedEmails > 0 ? "bg-[#dc2626] text-white" : "bg-[#e4e4e7] text-[#71717a]"
            }`}
          >
            {unrepliedEmails}
          </span>
          Unread emails
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#e4e4e7] text-[12px] font-semibold text-[#0a0a0a]">
          <span
            className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold leading-none ${
              openTickets > 0 ? "bg-[#dc2626] text-white" : "bg-[#e4e4e7] text-[#71717a]"
            }`}
          >
            {openTickets}
          </span>
          Open tickets
        </span>
      </div>

      {/* Tab pills */}
      <div className="flex flex-wrap items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
              activeTab === t.key
                ? "bg-[#15803d] text-white"
                : "bg-white border border-[#e4e4e7] text-[#71717a] hover:text-black hover:border-[#a1a1aa]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {(activeTab === "active" || activeTab === "collections") && <CollectionsPanel key={activeTab} workspace={activeTab} me={me} canManage={canManage} />}
      {activeTab === "chats" && <ChatsClient />}
      {activeTab === "emails" && <EmailsPanel />}
      {activeTab === "tickets" && <TicketsPanel me={me} />}
    </div>
  );
}
