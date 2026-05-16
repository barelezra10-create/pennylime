import { prisma } from "@/lib/db";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";

export const dynamic = "force-dynamic";

export default async function AgentSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const sp = await searchParams;
  const where = sp.channel ? { channel: sp.channel } : {};
  const sessions = await prisma.agentSession.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 100,
    include: { contact: { select: { firstName: true, lastName: true, phone: true, email: true } } },
  });

  const channels: { key: string; label: string }[] = [
    { key: "", label: "All" },
    { key: "chat", label: "Chat" },
    { key: "sms", label: "SMS" },
    { key: "voice", label: "Voice" },
  ];

  return (
    <div>
      <PageHeader title="Agent Sessions" description={`${sessions.length} most recent sessions`} />

      <div className="mb-6 flex flex-wrap gap-2">
        {channels.map((c) => {
          const active = (sp.channel ?? "") === c.key;
          return (
            <Link
              key={c.key || "all"}
              href={c.key ? `?channel=${c.key}` : "?"}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
                active ? "bg-[#1a1a1a] text-white" : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
              }`}
            >
              {c.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl bg-white border border-[#e4e4e7]">
        <table className="w-full">
          <thead>
            <tr className="bg-[#fafafa]">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Started</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Channel</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Contact</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Mode</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Live</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Auth</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Cost</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Ended</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[13px] text-[#a1a1aa]">
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
                return (
                <tr key={s.id} className="transition-colors hover:bg-[#f8f8f6] border-t border-[#f4f4f5]">
                  <td className="px-4 py-3 text-[13px]">
                    <Link href={`/admin/agent/sessions/${s.id}`} className="text-[#15803d] hover:underline font-medium">
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
