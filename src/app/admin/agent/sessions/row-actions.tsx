"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  archiveAgentSession,
  unarchiveAgentSession,
  deleteAgentSession,
} from "@/actions/archive";

export function SessionRowActions({
  sessionId,
  archived,
}: {
  sessionId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"archive" | "delete" | null>(null);

  async function handleArchive() {
    setBusy("archive");
    try {
      if (archived) {
        const r = await unarchiveAgentSession(sessionId);
        if (r.ok) toast.success("Session unarchived");
      } else {
        const r = await archiveAgentSession(sessionId);
        if (r.ok) toast.success("Session archived");
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this session and all its messages? Can't be undone.")) return;
    setBusy("delete");
    try {
      const r = await deleteAgentSession(sessionId);
      if (r.ok) toast.success("Session deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleArchive}
        disabled={busy !== null}
        className="rounded px-2 py-1 text-[11px] font-semibold text-[#71717a] hover:bg-[#f4f4f5] hover:text-black disabled:opacity-50"
        title={archived ? "Unarchive" : "Archive"}
      >
        {busy === "archive" ? "…" : archived ? "Unarchive" : "Archive"}
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy !== null}
        className="rounded px-2 py-1 text-[11px] font-semibold text-[#dc2626] hover:bg-[#fff1f2] disabled:opacity-50"
        title="Delete permanently"
      >
        {busy === "delete" ? "…" : "Delete"}
      </button>
    </div>
  );
}
