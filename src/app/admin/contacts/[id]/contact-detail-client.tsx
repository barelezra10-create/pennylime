"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TabBar } from "@/components/admin/tab-bar";
import { StageBadge } from "@/components/admin/stage-badge";
import { PageHeader } from "@/components/admin/page-header";
import { updateContactStage, assignContactRep, addContactTag, removeContactTag } from "@/actions/contacts";
import { logActivity } from "@/actions/activities";
import { PIPELINE_STAGES } from "@/lib/contact-helpers";
import { toast } from "sonner";
import Link from "next/link";

interface Activity {
  id: string;
  type: string;
  title: string;
  details?: string | null;
  performedBy?: string | null;
  createdAt: string;
}

interface Application {
  id: string;
  applicationCode: string;
  status: string;
  loanAmount: number;
  createdAt: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
}

interface Contact {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  phone?: string | null;
  stage: string;
  source?: string | null;
  utmSource?: string | null;
  utmCampaign?: string | null;
  utmMedium?: string | null;
  lastAppStep?: number | null;
  assignedRepId?: string | null;
  assignedRep?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  activities: Activity[];
  application: Application | null;
}

const TOTAL_APP_STEPS = 7;

const ACTIVITY_COLORS: Record<string, string> = {
  app_started: "bg-green-500",
  stage_changed: "bg-blue-500",
  note_added: "bg-gray-400",
  app_step_completed: "bg-amber-500",
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function ContactDetailClient({ contact, team }: { contact: Contact; team: TeamMember[] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const [stage, setStage] = useState(contact.stage);
  const [repId, setRepId] = useState(contact.assignedRepId ?? "");
  const [tags, setTags] = useState<string[]>(contact.tags);
  const [newTag, setNewTag] = useState("");
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "activity", label: "Activity", count: contact.activities.length },
    { id: "application", label: "Application" },
  ];

  const labelClass = "text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] mb-1.5 block";
  const inputClass = "w-full text-[13px] px-3.5 py-2.5 bg-[#f4f4f5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803d]/20";

  async function handleStageChange(newStage: string) {
    setStage(newStage);
    try {
      await updateContactStage(contact.id, newStage);
      await logActivity({ contactId: contact.id, type: "stage_changed", title: `Stage changed to ${newStage}` });
      toast.success("Stage updated");
      router.refresh();
    } catch {
      toast.error("Failed to update stage");
    }
  }

  async function handleRepChange(newRepId: string) {
    setRepId(newRepId);
    try {
      await assignContactRep(contact.id, newRepId || null);
      const rep = team.find((m) => m.id === newRepId);
      if (rep) {
        await logActivity({ contactId: contact.id, type: "stage_changed", title: `Assigned to ${rep.name}` });
      }
      toast.success("Rep assigned");
      router.refresh();
    } catch {
      toast.error("Failed to assign rep");
    }
  }

  async function handleAddTag() {
    const tag = newTag.trim();
    if (!tag || tags.includes(tag)) return;
    try {
      await addContactTag(contact.id, tag);
      setTags([...tags, tag]);
      setNewTag("");
      toast.success("Tag added");
      router.refresh();
    } catch {
      toast.error("Failed to add tag");
    }
  }

  async function handleRemoveTag(tag: string) {
    try {
      await removeContactTag(contact.id, tag);
      setTags(tags.filter((t) => t !== tag));
      toast.success("Tag removed");
      router.refresh();
    } catch {
      toast.error("Failed to remove tag");
    }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await logActivity({ contactId: contact.id, type: "note_added", title: "Note", details: noteText.trim() });
      setNoteText("");
      toast.success("Note added");
      router.refresh();
    } catch {
      toast.error("Failed to add note");
    }
    setAddingNote(false);
  }

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

  return (
    <div>
      <PageHeader
        title={fullName}
        description={contact.email}
      />

      <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-3 gap-6">
          {/* Left: info + stage + rep + tags */}
          <div className="col-span-2 space-y-4">
            {/* Info card */}
            <div className="bg-white rounded-xl p-6 border border-[#e4e4e7]">
              <h2 className="text-[13px] font-bold text-black mb-4 uppercase tracking-[0.05em]">Contact Info</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-[#a1a1aa]">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </span>
                  <span className="text-[13px] text-black font-medium">{fullName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#a1a1aa]">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </span>
                  <span className="text-[13px] text-[#71717a]">{contact.email}</span>
                </div>
                {contact.phone && (
                  <div className="flex items-center gap-3">
                    <span className="text-[#a1a1aa]">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    </span>
                    <span className="text-[13px] text-[#71717a]">{contact.phone}</span>
                  </div>
                )}
                {contact.source && (
                  <div className="flex items-center gap-3">
                    <span className="text-[#a1a1aa]">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                    </span>
                    <span className="text-[13px] text-[#71717a]">{contact.source}</span>
                  </div>
                )}
                {(contact.utmSource || contact.utmCampaign) && (
                  <div className="pt-2 border-t border-[#f4f4f5]">
                    <span className={labelClass}>UTM</span>
                    <div className="flex flex-wrap gap-2">
                      {contact.utmSource && <span className="text-[11px] bg-[#f4f4f5] rounded-lg px-2 py-1">source: {contact.utmSource}</span>}
                      {contact.utmCampaign && <span className="text-[11px] bg-[#f4f4f5] rounded-lg px-2 py-1">campaign: {contact.utmCampaign}</span>}
                      {contact.utmMedium && <span className="text-[11px] bg-[#f4f4f5] rounded-lg px-2 py-1">medium: {contact.utmMedium}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stage */}
            <div className="bg-white rounded-xl p-6 border border-[#e4e4e7]">
              <label className={labelClass}>Pipeline Stage</label>
              <div className="flex items-center gap-3">
                <select
                  value={stage}
                  onChange={(e) => handleStageChange(e.target.value)}
                  className={inputClass}
                >
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s} value={s}>{s.replace("_", " ")}</option>
                  ))}
                </select>
                <StageBadge stage={stage} />
              </div>
            </div>

            {/* Assigned Rep */}
            <div className="bg-white rounded-xl p-6 border border-[#e4e4e7]">
              <label className={labelClass}>Assigned Rep</label>
              <select
                value={repId}
                onChange={(e) => handleRepChange(e.target.value)}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div className="bg-white rounded-xl p-6 border border-[#e4e4e7]">
              <label className={labelClass}>Tags</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 text-[12px] bg-[#f4f4f5] rounded-lg px-2.5 py-1">
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="text-[#a1a1aa] hover:text-red-500 ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {tags.length === 0 && <span className="text-[13px] text-[#a1a1aa]">No tags yet</span>}
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
                  onClick={handleAddTag}
                  className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] whitespace-nowrap"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Right: quick stats */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-6 border border-[#e4e4e7]">
              <h2 className="text-[13px] font-bold text-black mb-4 uppercase tracking-[0.05em]">Quick Stats</h2>
              <div className="space-y-4">
                <div>
                  <span className={labelClass}>Created</span>
                  <p className="text-[13px] text-black">{new Date(contact.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                </div>
                <div>
                  <span className={labelClass}>Last Updated</span>
                  <p className="text-[13px] text-black">{new Date(contact.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                </div>
                {contact.lastAppStep != null && (
                  <div>
                    <span className={labelClass}>Last App Step</span>
                    <p className="text-[13px] text-black">Step {contact.lastAppStep} of {TOTAL_APP_STEPS}</p>
                  </div>
                )}
                <div>
                  <span className={labelClass}>Activities</span>
                  <p className="text-[13px] text-black">{contact.activities.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === "activity" && (
        <div className="max-w-2xl space-y-6">
          {/* Add Note */}
          <div className="bg-white rounded-xl p-6 border border-[#e4e4e7]">
            <h2 className="text-[13px] font-bold text-black mb-3">Add Note</h2>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="w-full text-[13px] px-3.5 py-2.5 bg-[#f4f4f5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803d]/20 resize-none"
              rows={3}
              placeholder="Type a note..."
            />
            <button
              onClick={handleAddNote}
              disabled={addingNote || !noteText.trim()}
              className="mt-3 bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] disabled:opacity-50"
            >
              {addingNote ? "Adding..." : "Add Note"}
            </button>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-xl p-6 border border-[#e4e4e7]">
            <h2 className="text-[13px] font-bold text-black mb-4">Timeline</h2>
            {contact.activities.length === 0 ? (
              <p className="text-[13px] text-[#a1a1aa]">No activity yet.</p>
            ) : (
              <div className="space-y-4">
                {contact.activities.map((a) => (
                  <div key={a.id} className="flex gap-3">
                    <div className="flex-shrink-0 mt-1">
                      <div className={`w-2.5 h-2.5 rounded-full ${ACTIVITY_COLORS[a.type] ?? "bg-gray-300"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium text-black">{a.title}</span>
                        <span className="text-[11px] text-[#a1a1aa] whitespace-nowrap">{relativeTime(a.createdAt)}</span>
                      </div>
                      {a.details && <p className="text-[12px] text-[#71717a] mt-0.5">{a.details}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Application Tab */}
      {activeTab === "application" && (
        <div className="max-w-xl">
          {contact.application ? (
            <div className="bg-white rounded-xl p-6 border border-[#e4e4e7] space-y-4">
              <h2 className="text-[13px] font-bold text-black uppercase tracking-[0.05em]">Application</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className={labelClass}>Application Code</span>
                  <p className="text-[13px] font-mono text-black">{contact.application.applicationCode}</p>
                </div>
                <div>
                  <span className={labelClass}>Status</span>
                  <span className="inline-block text-[11px] font-semibold bg-[#f0fdf4] text-[#15803d] px-2.5 py-1 rounded-lg">{contact.application.status}</span>
                </div>
                <div>
                  <span className={labelClass}>Loan Amount</span>
                  <p className="text-[13px] text-black">${contact.application.loanAmount.toLocaleString()}</p>
                </div>
                <div>
                  <span className={labelClass}>Submitted</span>
                  <p className="text-[13px] text-black">{new Date(contact.application.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                </div>
              </div>
              <Link
                href={`/admin/applications/${contact.application.id}`}
                className="inline-flex items-center gap-1.5 text-[13px] text-[#15803d] font-medium hover:underline"
              >
                View Full Application
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-xl p-6 border border-[#e4e4e7]">
              <h2 className="text-[13px] font-bold text-black mb-4 uppercase tracking-[0.05em]">Application Status</h2>
              {contact.lastAppStep != null ? (
                <div className="space-y-3">
                  <p className="text-[13px] text-[#71717a]">Completed {contact.lastAppStep} of {TOTAL_APP_STEPS} steps</p>
                  <div className="h-2 bg-[#f4f4f5] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#15803d] rounded-full transition-all"
                      style={{ width: `${(contact.lastAppStep / TOTAL_APP_STEPS) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-[#a1a1aa]">Application not yet submitted</p>
                </div>
              ) : (
                <p className="text-[13px] text-[#a1a1aa]">No application started</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
