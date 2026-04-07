"use client";

import Link from "next/link";
import { useState } from "react";

interface LandingPageItem {
  id: string;
  slug: string;
  metaTitle: string;
  utmCampaign: string;
  published: boolean;
  updatedAt: string;
}

export function LandingPagesClient({ pages }: { pages: LandingPageItem[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = pages
    .filter((p) => p.slug.toLowerCase().includes(search.toLowerCase()) || p.metaTitle.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => statusFilter === "all" || (statusFilter === "published" ? p.published : !p.published));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black">Landing Pages</h1>
        <Link
          href="/admin/content/landing-pages/new"
          className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534]"
        >
          New Landing Page
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search landing pages..."
          className="flex-1 max-w-xs text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-[#15803d]"
        />
        <div className="flex gap-1.5">
          {(["all", "published", "draft"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                statusFilter === f
                  ? "bg-[#15803d] text-white"
                  : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl overflow-hidden border border-[#e4e4e7]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#f4f4f5]">
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Slug</th>
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Meta Title</th>
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">UTM Campaign</th>
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Status</th>
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-[#f4f4f5] last:border-0 hover:bg-[#f8faf8] transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/content/landing-pages/${p.id}`}
                    className="text-[13px] font-medium text-black hover:text-[#15803d]"
                  >
                    {p.slug}
                  </Link>
                  <p className="text-[11px] text-[#a1a1aa]">/lp/{p.slug}</p>
                </td>
                <td className="px-4 py-3 text-[13px] text-[#71717a] max-w-[220px] truncate">{p.metaTitle}</td>
                <td className="px-4 py-3 text-[13px] text-[#71717a]">{p.utmCampaign}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${p.published ? "bg-[#f0f5f0] text-[#15803d]" : "bg-[#f4f4f5] text-[#71717a]"}`}>
                    {p.published ? "Published" : "Draft"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[13px] text-[#71717a]">
                  {new Date(p.updatedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-[#71717a] text-[14px] py-12">No landing pages found.</p>
        )}
      </div>
    </div>
  );
}
