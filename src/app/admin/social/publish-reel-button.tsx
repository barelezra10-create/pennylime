"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { publishReelNow } from "@/actions/publish-reel-now";

export function PublishReelButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    if (!confirm("Generate a fresh Veo video + caption and publish it to Instagram Reels right now? Takes 3-6 minutes.")) return;
    setSubmitting(true);
    const tid = toast.loading("Generating + publishing reel... this can take 3-6 min", { duration: 600_000 });
    const r = await publishReelNow();
    toast.dismiss(tid);
    setSubmitting(false);
    if (r.ok) {
      toast.success(`Published! topic="${r.topic}" · IG id ${r.platformPostId}`);
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={submitting}
      className="inline-flex items-center gap-2 rounded-lg bg-[#15803d] hover:bg-[#166534] disabled:opacity-60 text-white text-[13px] font-semibold px-4 py-2 transition-colors"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
      </svg>
      {submitting ? "Publishing..." : "Publish reel now"}
    </button>
  );
}
