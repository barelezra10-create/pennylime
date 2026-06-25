import { prisma } from "@/lib/db";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { SessionRowActions } from "./row-actions";
import { sessionDisplayStatus } from "@/lib/agent/session-status";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  needs_reply: "bg-[#dc2626] text-white",
  waiting_client: "bg-[#fef3c7] text-[#92400e]",
  resolved: "bg-[#dcfce7] text-[#166534]",
};

// Tab keys map to the DERIVED display status (so the tabs match the
// auto-computed badges, not a stored field).
const STATUS_TABS = ["needs_reply", "waiting_client", "resolved"] as const;

export default async function AgentSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; archived?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const showArchived = sp.archived === "1";
  const statusFilter = (STATUS_TABS as readonly string[]).includes(sp.status ?? "")
    ? sp.status
    : undefined;
  const where: {
    channel?: string;
    archivedAt?: { not: null } | null;
  } = {};
  if (sp.channel) where.channel = sp.channel;
  // Default: hide archived. ?archived=1 shows ONLY archived.
  where.archivedAt = showArchived ? { not: null } : null;
  const allSessions = await prisma.agentSession.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 300,
    include: {
      contact: { select: { firstName: true, lastName: true, phone: true, email: true } },
      // Pull the latest message so we can flag rows where the customer
      // is the last to have spoken (= needs admin reply / "unread").
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { role: true, createdAt: true, text: true },
      },
    },
  });

  // Compute the derived display status once per row, then apply the
  // status tab filter in-memory (the status is derived, not a column).
  const withStatus = allSessions.map((s) => ({
    s,
    display: sessionDisplayStatus({
      handlingStatus: s.handlingStatus,
      needsReply: !s.endedAt && s.messages[0]?.role === "user",
      hasMessages: s.messages.length > 0,
      ended: !!s.endedAt,
    }),
  }));
  const sessionsView = statusFilter
    ? withStatus.filter((r) => r.display.kind === statusFilter)
    : withStatus;
  const sessions = sessionsView.map((r) => r.s);

  const channels: { key: string; label: string }[] = [
    { key: "", label: "All" },
    { key: "chat", label: "Chat" },
    { key: "sms", label: "SMS" },
    { key: "voice", label: "Voice" },
  ];

  return (
    <div>
      <PageHeader title="Agent Sessions" description={`${sessions.length} most recent sessions`} />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {channels.map((c) => {
          const active = (sp.channel ?? "") === c.key;
          const params = new URLSearchParams();
          if (c.key) params.set("channel", c.key);
          if (showArchived) params.set("archived", "1");
          const href = `?${params.toString()}` || "?";
          return (
            <Link
              key={c.key || "all"}
              href={href}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
                active ? "bg-[#1a1a1a] text-white" : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
              }`}
            >
              {c.label}
            </Link>
          );
        })}
        <span className="mx-2 h-5 w-px bg-[#e4e4e7]" />
        {(() => {
          const params = new URLSearchParams();
          if (sp.channel) params.set("channel", sp.channel);
          if (!showArchived) params.set("archived", "1");
          return (
            <Link
              href={`?${params.toString()}`}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
                showArchived ? "bg-[#1a1a1a] text-white" : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
              }`}
            >
              {showArchived ? "Archived only" : "Show archived"}
            </Link>
          );
        })()}
        <span className="mx-2 h-5 w-px bg-[#e4e4e7]" />
        {[
          { key: "", label: "All" },
          { key: "needs_reply", label: "Needs reply" },
          { key: "waiting_client", label: "Waiting on client" },
          { key: "resolved", label: "Resolved" },
        ].map((st) => {
          const active = (statusFilter ?? "") === st.key;
          const params = new URLSearchParams();
          if (sp.channel) params.set("channel", sp.channel);
          if (showArchived) params.set("archived", "1");
          if (st.key) params.set("status", st.key);
          return (
            <Link
              key={st.key || "all-status"}
              href={`?${params.toString()}`}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
                active ? "bg-[#1a1a1a] text-white" : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
              }`}
            >
              {st.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl bg-white border border-[#e4e4e7]">
        <table className="w-full">
          <thead>
            <tr className="bg-[#fafafa]">
              <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Status</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Started</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Channel</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Contact</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Mode</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Live</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Auth</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Cost</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Ended</th>
              <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-[13px] text-[#a1a1aa]">
                  No sessions yet.
                </td>
              </tr>
            ) : (
              sessions.map((s) => {
                const isOnline = s.lastPolledAt ? Date.now() - s.lastPolledAt.getTime() < 30_000 : false;
                const displayName =
                  s.contact ? `${s.contact.firstName} ${s.contact.lastName ?? ""}`.trim() :
                  s.leadFirstName ? `${s.leadFirstName}${s.leadLastName ? ` ${s.leadLastName}` : ""} (lead)` :
                  "anon";
                // "Needs reply" = the latest message in this session is
                // from the customer (role="user") and the session hasn't
                // been formally ended. That's our "unread" signal.
                const lastMessage = s.messages[0];
                const needsReply = !s.endedAt && lastMessage?.role === "user";
                const display = sessionDisplayStatus({
                  handlingStatus: s.handlingStatus,
                  needsReply,
                  hasMessages: s.messages.length > 0,
                  ended: !!s.endedAt,
                });
                return (
                <tr key={s.id} className={`transition-colors border-t border-[#f4f4f5] ${
                  needsReply ? "bg-[#fff5f5] hover:bg-[#ffe9e9] font-medium" : "hover:bg-[#f8f8f6]"
                }`}>
                  <td className="px-3 py-3">
                    {display.kind === "needs_reply" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#dc2626] text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        {display.label}
                      </span>
                    ) : display.kind === "waiting_client" || display.kind === "resolved" ? (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[display.kind]}`}>
                        {display.label}
                      </span>
                    ) : display.kind === "no_messages" ? (
                      <span className="text-[11px] text-[#a1a1aa]">no messages</span>
                    ) : display.kind === "ended" ? (
                      <span className="text-[11px] text-[#a1a1aa]">ended</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-[#15803d] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#15803d]" />
                        {display.label}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[13px]">
                    <Link href={`/admin/agent/sessions/${s.id}`} className={`hover:underline ${needsReply ? "text-[#dc2626] font-bold" : "text-[#15803d] font-medium"}`}>
                      {s.startedAt.toISOString().slice(0, 16).replace("T", " ")}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-[#f4f4f5] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#71717a]">
                      {s.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-black">
                    {displayName}
                    {(s.contact?.email || s.leadEmail) && <div className="text-[11px] text-[#a1a1aa]">{s.contact?.email ?? s.leadEmail}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                      s.mode === "human" ? "bg-[#fef3c7] text-[#92400e]" : "bg-[#e0e7ff] text-[#3730a3]"
                    }`}>
                      {s.mode}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isOnline && !s.endedAt ? (
                      <span className="inline-flex items-center gap-1 text-[#15803d] text-[12px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#15803d]" /> online
                      </span>
                    ) : (
                      <span className="text-[12px] text-[#a1a1aa]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[#71717a]">{s.authLevel}</td>
                  <td className="px-4 py-3 text-[13px] text-black font-mono">${(s.costCents / 100).toFixed(3)}</td>
                  <td className="px-4 py-3 text-[13px] text-[#a1a1aa]">{s.endReason ?? "open"}</td>
                  <td className="px-3 py-3 text-right">
                    <SessionRowActions sessionId={s.id} archived={!!s.archivedAt} />
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
