import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";

export const dynamic = "force-dynamic";

export default async function AgentMetricsPage() {
  const since = new Date(Date.now() - 30 * 24 * 3600_000);
  const sessions = await prisma.agentSession.findMany({
    where: { startedAt: { gte: since } },
    select: { channel: true, costCents: true, endReason: true },
  });
  const toolStats = await prisma.agentToolCall.groupBy({
    by: ["name", "resultStatus"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });

  const byChannel = sessions.reduce<Record<string, { count: number; cost: number }>>((a, s) => {
    a[s.channel] = a[s.channel] ?? { count: 0, cost: 0 };
    a[s.channel].count++;
    a[s.channel].cost += s.costCents;
    return a;
  }, {});

  const escalated = sessions.filter((s) => s.endReason === "escalated" || s.endReason === "cost_cap").length;
  const totalSessions = sessions.length;
  const totalCost = sessions.reduce((sum, s) => sum + s.costCents, 0);

  return (
    <div>
      <PageHeader title="Agent Metrics" description={`Last 30 days · since ${since.toISOString().slice(0, 10)}`} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl bg-white border border-[#e4e4e7] p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] mb-1">Total sessions</div>
          <div className="text-[28px] font-extrabold tracking-[-0.03em] text-black">{totalSessions}</div>
        </div>
        <div className="rounded-xl bg-white border border-[#e4e4e7] p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] mb-1">Total spend</div>
          <div className="text-[28px] font-extrabold tracking-[-0.03em] text-black">${(totalCost / 100).toFixed(2)}</div>
        </div>
        <div className="rounded-xl bg-white border border-[#e4e4e7] p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] mb-1">Escalations / cost-cap exits</div>
          <div className="text-[28px] font-extrabold tracking-[-0.03em] text-black">{escalated}</div>
        </div>
      </div>

      <h2 className="text-[14px] font-bold text-black mb-3">By channel</h2>
      <div className="overflow-hidden rounded-xl bg-white border border-[#e4e4e7] mb-8">
        <table className="w-full">
          <thead>
            <tr className="bg-[#fafafa]">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Channel</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Sessions</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Total cost</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(byChannel).length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-[13px] text-[#a1a1aa]">No data yet.</td>
              </tr>
            ) : (
              Object.entries(byChannel).map(([ch, v]) => (
                <tr key={ch} className="border-t border-[#f4f4f5] hover:bg-[#f8f8f6]">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-[#f4f4f5] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#71717a]">
                      {ch}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-black">{v.count}</td>
                  <td className="px-4 py-3 text-[13px] text-black font-mono">${(v.cost / 100).toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-[14px] font-bold text-black mb-3">Tool calls</h2>
      <div className="overflow-hidden rounded-xl bg-white border border-[#e4e4e7]">
        <table className="w-full">
          <thead>
            <tr className="bg-[#fafafa]">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Tool</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Status</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Count</th>
            </tr>
          </thead>
          <tbody>
            {toolStats.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-[13px] text-[#a1a1aa]">No tool calls yet.</td>
              </tr>
            ) : (
              toolStats.map((t, i) => (
                <tr key={i} className="border-t border-[#f4f4f5] hover:bg-[#f8f8f6]">
                  <td className="px-4 py-3 text-[13px] text-black font-mono">{t.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-[#f4f4f5] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#71717a]">
                      {t.resultStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-black">{t._count._all}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
