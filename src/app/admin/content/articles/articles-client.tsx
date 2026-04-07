"use client";

import Link from "next/link";
import { useState } from "react";

interface ArticleWithRelations {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
  category: { name: string } | null;
}

export function ArticlesClient({ articles }: { articles: ArticleWithRelations[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = articles
    .filter((a) => a.title.toLowerCase().includes(search.toLowerCase()))
    .filter((a) => statusFilter === "all" || (statusFilter === "published" ? a.published : !a.published));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black">Articles</h1>
        <Link
          href="/admin/content/articles/new"
          className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534] transition-colors"
        >
          New Article
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search articles..."
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
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Title</th>
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Category</th>
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Status</th>
              <th className="text-left text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((article) => (
              <tr key={article.id} className="border-b border-[#f4f4f5] last:border-0 hover:bg-[#f8faf8] transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/admin/content/articles/${article.id}`} className="text-[13px] font-medium text-black hover:text-[#15803d]">
                    {article.title}
                  </Link>
                  <p className="text-[11px] text-[#a1a1aa]">/blog/{article.slug}</p>
                </td>
                <td className="px-4 py-3 text-[13px] text-[#71717a]">{article.category?.name || ","}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${article.published ? "bg-[#f0f5f0] text-[#15803d]" : "bg-[#f4f4f5] text-[#71717a]"}`}>
                    {article.published ? "Published" : "Draft"}
                  </span>
                </td>
                <td className="px-4 py-3 text-[13px] text-[#71717a]">
                  {new Date(article.updatedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-[#71717a] text-[14px] py-12">No articles found.</p>
        )}
      </div>
    </div>
  );
}
