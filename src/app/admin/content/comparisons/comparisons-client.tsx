"use client";

import Link from "next/link";

interface ComparisonItem { id: string; title: string; slug: string; entityA: string; entityB: string; published: boolean; updatedAt: string; }

export function ComparisonsClient({ comparisons }: { comparisons: ComparisonItem[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black">Comparison Pages</h1>
        <Link href="/admin/content/comparisons/new" className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534]">New Comparison</Link>
      </div>
      <div className="bg-white rounded-[10px] overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-[#f4f4f5]"><th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Title</th><th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Entities</th><th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Status</th></tr></thead>
          <tbody>
            {comparisons.map((c) => (
              <tr key={c.id} className="border-b border-[#f4f4f5] last:border-0 hover:bg-[#f8faf8]">
                <td className="px-4 py-3"><Link href={`/admin/content/comparisons/${c.id}`} className="text-[13px] font-medium text-black hover:text-[#15803d]">{c.title}</Link><p className="text-[11px] text-[#a1a1aa]">/compare/{c.slug}</p></td>
                <td className="px-4 py-3 text-[13px] text-[#71717a]">{c.entityA} vs {c.entityB}</td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${c.published ? "bg-[#f0f5f0] text-[#15803d]" : "bg-[#f4f4f5] text-[#71717a]"}`}>{c.published ? "Published" : "Draft"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {comparisons.length === 0 && <p className="text-center text-[#71717a] text-[14px] py-12">No comparison pages yet.</p>}
      </div>
    </div>
  );
}
