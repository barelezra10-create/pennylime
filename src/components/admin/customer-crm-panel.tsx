"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PIPELINE_STAGES } from "@/lib/contact-helpers";
import {
  updateContactStage,
  assignContactRep,
  addContactTag,
  removeContactTag,
} from "@/actions/contacts";
import { logActivity } from "@/actions/activities";

export type CustomerCrm = {
  contactId: string;
  stage: string;
  assignedRepId: string | null;
  assignedRepName: string | null;
  tags: string[];
  activities: Array<{
    id: string;
    type: string;
    title: string;
    details: string | null;
    performedBy: string | null;
    createdAt: string;
  }>;
  team: Array<{ id: string; name: string }>;
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ACTIVITY_COLORS: Record<string, string> = {
  note_added: "bg-[#15803d]",
  stage_changed: "bg-[#2563eb]",
  rep_assigned: "bg-[#b45309]",
  tag_added: "bg-[#7c3aed]",
  tag_removed: "bg-[#a1a1aa]",
  application_submitted: "bg-[#0891b2]",
  call: "bg-[#dc2626]",
};

const inputClass =
  "w-full rounded-xl border border-[#e4e4e7] bg-white px-3.5 py-2.5 text-[13px] text-black focus:outline-none focus:ring-2 focus:ring-[#15803d]/20 focus:border-[#15803d]";

export function CustomerCrmPanel({ crm }: { crm: CustomerCrm }) {
  const router = useRouter();

  const [stage, setStage] = useState(crm.stage);
  const [repId, setRepId] = useState(crm.assignedRepId ?? "");
  const [tags, setTags] = useState<string[]>(crm.tags);
  const [newTag, setNewTag] = useState("");
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [activities, setActivities] = useState(crm.activities);

  async function handleStageChange(newStage: string) {
    setStage(newStage);
    try {
      await updateContactStage(crm.contactId, newStage);
      toast.success("Stage updated");
      router.refresh();
    } catch {
      toast.error("Failed to update stage");
    }
  }

  async function handleRepChange(newRepId: string) {
    setRepId(newRepId);
    try {
      await assignContactRep(crm.contactId, newRepId || null);
      toast.success("Rep assigned");
      router.refresh();
    } catch {
      toast.error("Failed to assign rep");
    }
  }

  async function handleAddTag() {
    const tag = newTag.trim();
    if (!tag || tags.includes(tag)) return;
    setNewTag("");
    setTags((t) => [...t, tag]);
    try {
      await addContactTag(crm.contactId, tag);
      toast.success("Tag added");
      router.refresh();
    } catch {
      toast.error("Failed to add tag");
      setTags((t) => t.filter((x) => x !== tag));
    }
  }

  async function handleRemoveTag(tag: string) {
    setTags((t) => t.filter((x) => x !== tag));
    try {
      await removeContactTag(crm.contactId, tag);
      toast.success("Tag removed");
      router.refresh();
    } catch {
      toast.error("Failed to remove tag");
      setTags((t) => [...t, tag]);
    }
  }

  async function handleAddNote() {
    const text = noteText.trim();
    if (!text) return;
    setAddingNote(true);
    try {
      await logActivity({
        contactId: crm.contactId,
        type: "note_added",
        title: "Note",
        details: text,
      });
      setNoteText("");
      // Optimistically prepend the new note to the local activity list
      const fakeActivity = {
        id: `tmp-${Date.now()}`,
        type: "note_added",
        title: "Note",
        details: text,
        performedBy: null,
        createdAt: new Date().toISOString(),
      };
      setActivities((prev) => [fakeActivity, ...prev]);
      toast.success("Note added");
      router.refresh();
    } catch {
      toast.error("Failed to add note");
    } finally {
      setAddingNote(false);
    }
  }

  const labelClass = "block text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold mb-2";

  return (
    <div className="bg-white rounded-[10px] border border-[#e4e4e7] p-6">
      <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black mb-5 flex items-center gap-2">
        <svg className="h-5 w-5 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
        </svg>
        Customer (CRM)
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        {/* Stage */}
        <div>
          <label className={labelClass}>Pipeline Stage</label>
          <select
            value={stage}
            onChange={(e) => handleStageChange(e.target.value)}
            className={inputClass}
          >
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        {/* Assigned Rep */}
        <div>
          <label className={labelClass}>Assigned Rep</label>
          <select
            value={repId}
            onChange={(e) => handleRepChange(e.target.value)}
            className={inputClass}
          >
            <option value="">Unassigned</option>
            {crm.team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tags */}
      <div className="mb-5">
        <label className={labelClass}>Tags</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-[12px] bg-[#f4f4f5] rounded-lg px-2.5 py-1"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="text-[#a1a1aa] hover:text-red-500 ml-0.5 leading-none"
              >
                x
              </button>
            </span>
          ))}
          {tags.length === 0 && (
            <span className="text-[13px] text-[#a1a1aa]">No tags yet</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
            className={inputClass}
            placeholder="Add tag..."
          />
          <button
            type="button"
            onClick={handleAddTag}
            className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] whitespace-nowrap"
          >
            Add
          </button>
        </div>
      </div>

      {/* Add Note */}
      <div className="mb-5">
        <label className={labelClass}>Add Note</label>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          className="w-full text-[13px] px-3.5 py-2.5 bg-[#f4f4f5] rounded-xl border border-transparent focus:outline-none focus:ring-2 focus:ring-[#15803d]/20 resize-none"
          rows={2}
          placeholder="Type a note..."
        />
        <button
          type="button"
          onClick={handleAddNote}
          disabled={addingNote || !noteText.trim()}
          className="mt-2 bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] disabled:opacity-50"
        >
          {addingNote ? "Adding..." : "Add Note"}
        </button>
      </div>

      {/* Activity Timeline */}
      <div>
        <label className={labelClass}>Activity Timeline</label>
        {activities.length === 0 ? (
          <p className="text-[13px] text-[#a1a1aa]">No activity yet.</p>
        ) : (
          <div className="space-y-3">
            {activities.map((a) => (
              <div key={a.id} className="flex gap-3">
                <div className="flex-shrink-0 mt-1.5">
                  <div
                    className={`w-2 h-2 rounded-full ${ACTIVITY_COLORS[a.type] ?? "bg-gray-300"}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium text-black">{a.title}</span>
                    <span className="text-[11px] text-[#a1a1aa] whitespace-nowrap">
                      {relativeTime(a.createdAt)}
                    </span>
                  </div>
                  {a.details && (
                    <p className="text-[12px] text-[#71717a] mt-0.5">{a.details}</p>
                  )}
                  {a.performedBy && (
                    <p className="text-[11px] text-[#a1a1aa] mt-0.5">{a.performedBy}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
