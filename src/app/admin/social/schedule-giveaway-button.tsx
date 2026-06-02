"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { scheduleGiveawayCampaign } from "@/actions/schedule-giveaway";

export function ScheduleGiveawayButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    if (!confirm("Schedule the $500 Amazon gift card giveaway across June 2026 (7 IG posts)? Generates 1 fresh image (~30s).")) return;
    setSubmitting(true);
    const tid = toast.loading("Generating image + scheduling 7 posts...", { duration: 120_000 });
    const r = await scheduleGiveawayCampaign();
    toast.dismiss(tid);
    setSubmitting(false);
    if (r.ok) {
      toast.success(`Scheduled ${r.scheduled} posts (${r.skipped} skipped as duplicates)`);
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
      className="inline-flex items-center gap-2 rounded-lg bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-60 text-white text-[13px] font-semibold px-4 py-2 transition-colors"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 1 0 9.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1 1 14.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
      </svg>
      {submitting ? "Scheduling..." : "Schedule June giveaway"}
    </button>
  );
}
