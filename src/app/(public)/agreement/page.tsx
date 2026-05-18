import fs from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata = {
  title: "Receivables Purchase and Sale Agreement — PennyLime",
  description:
    "The Receivables Purchase and Sale Agreement that governs every PennyLime cash advance.",
};

/**
 * Public-facing receivables purchase agreement. Sourced from
 * docs/legal/...md so the legal team can edit the canonical
 * version in one place. Static + ISR every hour so updates
 * propagate without a redeploy.
 */
export default async function AgreementPage() {
  const mdPath = path.join(
    process.cwd(),
    "docs",
    "legal",
    "2026-05-17-receivables-purchase-agreement-draft.md",
  );
  const md = await fs.readFile(mdPath, "utf8");
  const html = await marked.parse(md);

  return (
    <div className="min-h-screen bg-[#fafaf7] py-12">
      <article className="max-w-3xl mx-auto px-5 md:px-8 bg-white border border-[#e4e4e7] rounded-2xl p-8 md:p-12 shadow-sm">
        <div
          className="prose prose-sm md:prose-base max-w-none text-[#1a1a1a]
            prose-headings:tracking-[-0.02em] prose-headings:text-[#0a0a0a]
            prose-h1:text-[28px] prose-h1:font-extrabold prose-h1:border-b prose-h1:border-[#15803d] prose-h1:pb-3
            prose-h2:text-[18px] prose-h2:font-bold prose-h2:text-[#15803d] prose-h2:mt-10
            prose-h3:text-[15px] prose-h3:font-bold prose-h3:mt-6
            prose-blockquote:border-l-4 prose-blockquote:border-[#f59e0b] prose-blockquote:bg-[#fef3c7] prose-blockquote:text-[#78350f] prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r
            prose-table:text-sm
            prose-th:bg-[#fafafa] prose-th:border prose-th:border-[#e4e4e7]
            prose-td:border prose-td:border-[#e4e4e7]
            prose-code:bg-[#f4f4f5] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[12px] prose-code:font-mono
            prose-a:text-[#15803d] prose-a:no-underline hover:prose-a:underline
            prose-strong:text-[#0a0a0a]
            prose-li:my-1"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
    </div>
  );
}
