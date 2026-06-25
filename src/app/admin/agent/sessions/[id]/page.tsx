import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { SessionReplyPanel } from "./reply-panel";
import { SessionStatusControls } from "./status-controls";

export const dynamic = "force-dynamic";

export default async function SessionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await prisma.agentSession.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      toolCalls: { orderBy: { createdAt: "asc" } },
      contact: true,
    },
  });
  if (!session) return notFound();

  const events = [
    ...session.messages.map((m) => ({ kind: "msg" as const, at: m.createdAt, row: m })),
    ...session.toolCalls.map((t) => ({ kind: "tool" as const, at: t.createdAt, row: t })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const contactName = session.contact
    ? `${session.contact.firstName} ${session.contact.lastName ?? ""}`.trim()
    : session.leadFirstName
      ? `${session.leadFirstName}${session.leadLastName ? ` ${session.leadLastName}` : ""} (lead)`
      : "anon";

  const isOnline = session.lastPolledAt
    ? Date.now() - session.lastPolledAt.getTime() < 30_000
    : false;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Session ${session.id.slice(0, 8)}`}
        description={`${session.channel} · ${session.authLevel} · cost $${(session.costCents / 100).toFixed(3)}${session.endedAt ? ` · ended ${session.endReason}` : ""}`}
      />

      <div className="mb-6 flex flex-wrap gap-2 text-[13px]">
        <Link
          href="/admin/agent/sessions"
          className="rounded-lg bg-[#f4f4f5] px-3 py-1.5 font-medium text-[#71717a] hover:bg-[#e4e4e7]"
        >
          ← Back to sessions
        </Link>
        <div className="rounded-lg bg-white border border-[#e4e4e7] px-3 py-1.5 text-[#71717a]">
          Contact: <span className="text-black font-medium">{contactName}</span>
          {(session.contact?.email || session.leadEmail) && (
            <span className="ml-2 text-[#a1a1aa]">{session.contact?.email ?? session.leadEmail}</span>
          )}
          {session.contact?.phone && <span className="ml-2 text-[#a1a1aa]">{session.contact.phone}</span>}
        </div>
        <div className="rounded-lg bg-white border border-[#e4e4e7] px-3 py-1.5 text-[#71717a]">
          Started <span className="text-black font-mono">{session.startedAt.toISOString().slice(0, 16).replace("T", " ")}</span>
        </div>
        <div className={`rounded-lg px-3 py-1.5 font-semibold text-[12px] uppercase tracking-wide ${
          session.mode === "human" ? "bg-[#fef3c7] text-[#92400e]" : "bg-[#e0e7ff] text-[#3730a3]"
        }`}>
          Mode: {session.mode}
        </div>
        <div className={`rounded-lg px-3 py-1.5 font-semibold text-[12px] uppercase tracking-wide ${
          isOnline ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#f4f4f5] text-[#71717a]"
        }`}>
          {isOnline ? "● online" : "○ offline"}
        </div>
        {session.handlingStatus === "RESOLVED" && (
          <div className="rounded-lg px-3 py-1.5 font-semibold text-[12px] uppercase tracking-wide bg-[#dcfce7] text-[#166534]">
            Resolved
          </div>
        )}
      </div>

      <div className="space-y-2 mb-6">
        {events.length === 0 ? (
          <div className="rounded-xl bg-white border border-[#e4e4e7] p-6 text-center text-[13px] text-[#a1a1aa]">
            No transcript yet.
          </div>
        ) : (
          events.map((e, i) => {
            if (e.kind === "msg") {
              const isHuman = e.row.role === "assistant" && e.row.senderEmail;
              const bg =
                e.row.role === "user"
                  ? "bg-blue-50 border-blue-100"
                  : isHuman
                    ? "bg-[#f0fdf4] border-[#bbf7d0]"
                    : e.row.role === "assistant"
                      ? "bg-[#fafafa] border-[#e4e4e7]"
                      : "bg-yellow-50 border-yellow-100";
              const label = isHuman ? `admin (${e.row.senderEmail})` : e.row.role;
              return (
                <div key={i} className={`rounded-xl border p-4 ${bg}`}>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-1.5 flex justify-between">
                    <span>{label}{e.row.emailedAt ? " · emailed" : ""}</span>
                    <span className="font-mono">{e.row.createdAt.toISOString().slice(11, 19)}</span>
                  </div>
                  <div className="text-[13px] text-black whitespace-pre-wrap">{e.row.text}</div>
                </div>
              );
            }
            return (
              <div key={i} className="rounded-xl border border-purple-100 bg-purple-50 p-4 text-[13px]">
                <div className="font-mono text-[11px] text-[#71717a]">
                  [tool] {e.row.name} → {e.row.resultStatus} ({e.row.durationMs}ms)
                </div>
                {e.row.resultSummary && <div className="text-[#3f3f46] mt-1.5">{e.row.resultSummary}</div>}
                {e.row.errorMessage && <div className="text-[#b91c1c] mt-1.5">{e.row.errorMessage}</div>}
              </div>
            );
          })
        )}
      </div>

      <SessionStatusControls sessionId={session.id} initialStatus={session.handlingStatus} />
      <SessionReplyPanel sessionId={session.id} initialMode={session.mode} isOnline={isOnline} />
    </div>
  );
}
