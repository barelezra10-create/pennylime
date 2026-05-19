"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  planSeoMonthAction,
  generateArticleAction,
  publishNowAction,
  deletePlannedArticleAction,
} from "./actions";

export function PlanMonthButton({
  year,
  month,
  remainingCount,
}: {
  year: number;
  month: number;
  remainingCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const chunkSize = Math.min(3, remainingCount);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    const t = toast.loading(`Planning ${chunkSize} topic${chunkSize > 1 ? "s" : ""} via Gemini…`);
    try {
      const r = await planSeoMonthAction(year, month);
      if (r.ok) {
        toast.success(
          `Planned ${r.created} new topic${r.created !== 1 ? "s" : ""}${r.skipped ? ` (${r.skipped} skipped)` : ""}.`,
          { id: t },
        );
        router.refresh();
      } else {
        toast.error(`Planning failed: ${r.error}`, { id: t });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Planning failed", { id: t });
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="bg-[#15803d] text-white px-4 py-2 rounded-lg text-[13px] font-semibold hover:bg-[#166534] disabled:opacity-50"
      title={`Plans 3 topics per click. ${Math.ceil(remainingCount / 3)}x to fill all ${remainingCount} open slots.`}
    >
      {busy ? "Planning…" : `Plan next ${chunkSize} of ${remainingCount} open`}
    </button>
  );
}

export function ArticleRowActions({
  articleId,
  slug,
  contentGenerated,
  published,
}: {
  articleId: string;
  slug: string;
  contentGenerated: boolean;
  published: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "generate" | "publish" | "delete">(null);

  async function handleGenerate() {
    if (busy) return;
    setBusy("generate");
    const t = toast.loading("Writing article body with Gemini… ~30s");
    try {
      const r = await generateArticleAction(articleId);
      if (r.ok) {
        toast.success(`Generated ${r.wordCount} words.`, { id: t });
        router.refresh();
      } else {
        toast.error(`Generation failed: ${r.error}`, { id: t });
      }
    } finally {
      setBusy(null);
    }
  }

  async function handlePublish() {
    if (busy) return;
    setBusy("publish");
    const t = toast.loading(contentGenerated ? "Publishing…" : "Writing body + publishing…");
    try {
      const r = await publishNowAction(articleId);
      if (r.ok) {
        toast.success("Published.", { id: t });
        router.refresh();
      } else {
        toast.error(`Publish failed: ${r.error}`, { id: t });
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (busy) return;
    if (!confirm("Delete this planned article? Can't be undone.")) return;
    setBusy("delete");
    try {
      const r = await deletePlannedArticleAction(articleId);
      if (r.ok) {
        toast.success("Deleted.");
        router.refresh();
      } else {
        toast.error(`Delete failed: ${r.error}`);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-3">
      {!contentGenerated && (
        <button
          onClick={handleGenerate}
          disabled={busy !== null}
          className="rounded-md bg-[#15803d] text-white px-2.5 py-1 text-[11px] font-semibold hover:bg-[#166534] disabled:opacity-50"
        >
          {busy === "generate" ? "Generating…" : "Generate body"}
        </button>
      )}
      {contentGenerated && !published && (
        <button
          onClick={handlePublish}
          disabled={busy !== null}
          className="rounded-md bg-[#15803d] text-white px-2.5 py-1 text-[11px] font-semibold hover:bg-[#166534] disabled:opacity-50"
        >
          {busy === "publish" ? "Publishing…" : "Publish now"}
        </button>
      )}
      <Link
        href={`/admin/content/articles/${articleId}`}
        className="rounded-md border border-[#e4e4e7] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#52525b] hover:bg-gray-50"
      >
        Edit
      </Link>
      {published && (
        <Link
          href={`/blog/${slug}`}
          target="_blank"
          className="rounded-md border border-[#dcfce7] bg-[#f7fbf8] px-2.5 py-1 text-[11px] font-semibold text-[#15803d] hover:bg-[#dcfce7]"
        >
          View live →
        </Link>
      )}
      {!published && (
        <button
          onClick={handleDelete}
          disabled={busy !== null}
          className="ml-auto rounded-md text-[11px] font-semibold text-[#dc2626] hover:bg-[#fef2f2] px-2 py-1 disabled:opacity-50"
        >
          {busy === "delete" ? "…" : "Delete"}
        </button>
      )}
    </div>
  );
}
