import { prisma } from "@/lib/db";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  if (status === "open") return "bg-amber-100 text-amber-800";
  if (status === "resolved") return "bg-emerald-100 text-emerald-800";
  if (status === "closed") return "bg-[#f4f4f5] text-[#71717a]";
  return "bg-[#f4f4f5] text-[#71717a]";
}

export default async function TicketsPage() {
  const tickets = await prisma.supportTicket.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
  });

  const openCount = tickets.filter((t) => t.status === "open").length;

  return (
    <div>
      <PageHeader title="Support Tickets" description={`${openCount} open · ${tickets.length} most recent`} />

      <div className="overflow-hidden rounded-xl bg-white border border-[#e4e4e7]">
        <table className="w-full">
          <thead>
            <tr className="bg-[#fafafa]">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Created</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Contact</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Reason</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Status</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">Session</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[13px] text-[#a1a1aa]">
                  No tickets yet.
                </td>
              </tr>
            ) : (
              tickets.map((t) => (
                <tr key={t.id} className="border-t border-[#f4f4f5] hover:bg-[#f8f8f6]">
                  <td className="px-4 py-3 text-[13px] text-[#71717a] font-mono">
                    {t.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-black">
                    {t.contact ? `${t.contact.firstName} ${t.contact.lastName ?? ""}`.trim() : "anon"}
                    {t.contact?.phone && <span className="text-[#a1a1aa] ml-2">{t.contact.phone}</span>}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-black">{t.reason}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${statusBadge(t.status)}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px]">
                    {t.sessionId ? (
                      <Link href={`/admin/agent/sessions/${t.sessionId}`} className="text-[#15803d] hover:underline font-medium">
                        view
                      </Link>
                    ) : (
                      <span className="text-[#a1a1aa]">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
