"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TabBar } from "@/components/admin/tab-bar";
import { StageBadge } from "@/components/admin/stage-badge";
import { PageHeader } from "@/components/admin/page-header";
import { updateContactStage, assignContactRep, addContactTag, removeContactTag } from "@/actions/contacts";
import { logActivity } from "@/actions/activities";
import { sendCrmEmail, getCrmEmailTemplates, getRecentEmailsForContact, type CrmEmailTemplate } from "@/actions/crm-email";
import { PIPELINE_STAGES } from "@/lib/contact-helpers";
import { fmtMoney, cadenceLabel, type LoanSummary } from "@/lib/loan-summary";
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

interface PaymentRow {
  id: string;
  paymentNumber: number;
  amount: number;
  principal: number;
  interest: number;
  lateFee: number;
  dueDate: string;
  paidAt: string | null;
  status: string;
}

interface ContactDocument {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  documentType: string;
  createdAt: string;
}

interface Application {
  id: string;
  applicationCode: string;
  status: string;
  loanAmount: number;
  createdAt: string;
  payments: PaymentRow[];
  documents: ContactDocument[];
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
  loan: LoanSummary;
}

const TOTAL_APP_STEPS = 11;

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

  const documents = contact.application?.documents ?? [];
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "activity", label: "Activity", count: contact.activities.length },
    { id: "email", label: "Email" },
    { id: "files", label: "Files", count: documents.length },
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

      {contact.loan.hasLoan && <LoanSummaryCard loan={contact.loan} />}

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

      {/* Email Tab */}
      {activeTab === "email" && (
        <EmailTab contactId={contact.id} contactEmail={contact.email} />
      )}

      {/* Files Tab */}
      {activeTab === "files" && (
        <FilesTab documents={documents} />
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
                  <span className={labelClass}>Advance Amount</span>
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

function LoanSummaryCard({ loan }: { loan: LoanSummary }) {
  const barColor = loan.isComplete ? "bg-[#15803d]" : loan.isLate ? "bg-[#dc2626]" : "bg-[#0ea5e9]";
  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[13px] font-bold text-black uppercase tracking-[0.05em]">Advance</h2>
        {loan.isComplete && <span className="inline-flex text-[10px] font-bold uppercase tracking-[0.04em] bg-[#f0fdf4] text-[#15803d] rounded px-2 py-0.5">Paid off</span>}
        {loan.isLate && !loan.isComplete && <span className="inline-flex text-[10px] font-bold uppercase tracking-[0.04em] bg-[#fef2f2] text-[#dc2626] rounded px-2 py-0.5">Late</span>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Stat label="Advance amount" value={fmtMoney(loan.fundedAmount || loan.loanAmount)} />
        <Stat label="Per payment" value={`${fmtMoney(loan.perPaymentAmount)}${cadenceLabel(loan.cadence)}`} />
        <Stat label="Paid" value={`${fmtMoney(loan.paidAmount)}`} sub={`${loan.paidPayments} of ${loan.totalPayments} payments`} />
        <Stat label="Remaining" value={fmtMoney(loan.remainingAmount)} sub={`${loan.remainingPayments} payments left`} />
      </div>
      <div>
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="text-[#71717a]">Repayment progress</span>
          <span className="text-[#a1a1aa] tabular-nums">{loan.progressPct}%</span>
        </div>
        <div className="h-2 rounded-full bg-[#f4f4f5] overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${loan.progressPct}%` }} />
        </div>
        {loan.nextDue && !loan.isComplete && (
          <p className="mt-3 text-[12px] text-[#71717a]">
            Next payment of <strong className="text-black">{fmtMoney(loan.nextDue.amount)}</strong> due{" "}
            <strong className="text-black">{new Date(loan.nextDue.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</strong>
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#71717a] mb-1">{label}</p>
      <p className="text-[18px] font-extrabold tracking-[-0.02em] text-black tabular-nums leading-none">{value}</p>
      {sub && <p className="text-[10px] text-[#a1a1aa] mt-1">{sub}</p>}
    </div>
  );
}

function EmailTab({ contactId, contactEmail }: { contactId: string; contactEmail: string }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<CrmEmailTemplate[]>([]);
  const [recentEmails, setRecentEmails] = useState<Array<{ id: string; subject: string | null; type: string; createdAt: Date }>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [tpls, recents] = await Promise.all([
        getCrmEmailTemplates(),
        getRecentEmailsForContact(contactId),
      ]);
      if (cancelled) return;
      setTemplates(tpls);
      setRecentEmails(recents);
    })();
    return () => { cancelled = true; };
  }, [contactId]);

  function applyTemplate(id: string) {
    setSelectedTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setBody(t.body);
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body required");
      return;
    }
    setSending(true);
    try {
      const r = await sendCrmEmail({ contactId, subject, body });
      if (r.ok) {
        toast.success(`Email sent to ${contactEmail}`);
        setSelectedTemplateId("");
        setSubject("");
        setBody("");
        const recents = await getRecentEmailsForContact(contactId);
        setRecentEmails(recents);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-4">
        <div className="bg-white rounded-xl p-6 border border-[#e4e4e7]">
          <h2 className="text-[13px] font-bold text-black mb-4 uppercase tracking-[0.05em]">
            Send Email
          </h2>
          <p className="text-[12px] text-[#71717a] mb-4">
            From <code className="bg-[#f4f4f5] px-1 rounded">notifications@pennylime.com</code>{" "}
            · Reply-to <code className="bg-[#f4f4f5] px-1 rounded">info@pennylime.com</code>{" "}
            · To <strong className="text-black">{contactEmail}</strong>
          </p>

          <div className="mb-4">
            <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] mb-1.5 block">
              Template
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => applyTemplate(e.target.value)}
              className="w-full text-[13px] px-3.5 py-2.5 bg-[#f4f4f5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803d]/20"
            >
              <option value="">— Pick a template or start blank —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {selectedTemplate && (
              <p className="text-[11px] text-[#71717a] mt-1">{selectedTemplate.description}</p>
            )}
          </div>

          <div className="mb-4">
            <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] mb-1.5 block">
              Subject
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
              className="w-full text-[13px] px-3.5 py-2.5 bg-[#f4f4f5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803d]/20"
            />
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">
                Body (HTML allowed)
              </label>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="text-[11px] font-semibold text-[#15803d] hover:underline"
              >
                {showPreview ? "Edit" : "Preview"}
              </button>
            </div>
            {showPreview ? (
              <div
                className="text-[13px] bg-white border border-[#e4e4e7] rounded-xl p-4 min-h-[200px] prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: body }}
              />
            ) : (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                placeholder="<p>Hi {{firstName}},</p>..."
                className="w-full text-[13px] px-3.5 py-2.5 bg-[#f4f4f5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803d]/20 font-mono"
              />
            )}
            <p className="text-[11px] text-[#71717a] mt-1">
              Vars: <code>{`{{firstName}}`}</code>, <code>{`{{lastName}}`}</code>,{" "}
              <code>{`{{applicationCode}}`}</code>, <code>{`{{loanAmount}}`}</code>,{" "}
              <code>{`{{email}}`}</code>, <code>{`{{phone}}`}</code>
            </p>
          </div>

          <button
            onClick={handleSend}
            disabled={sending}
            className="bg-[#15803d] text-white text-[13px] font-semibold rounded-xl px-5 py-2.5 hover:bg-[#166534] disabled:opacity-50"
          >
            {sending ? "Sending…" : `Send to ${contactEmail}`}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white rounded-xl p-6 border border-[#e4e4e7]">
          <h3 className="text-[13px] font-bold text-black mb-3 uppercase tracking-[0.05em]">
            Recent emails
          </h3>
          {recentEmails.length === 0 ? (
            <p className="text-[12px] text-[#a1a1aa]">No emails sent yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentEmails.map((e) => {
                const isReceived = e.type === "received";
                return (
                  <li key={e.id} className="border-b border-[#f4f4f5] last:border-0 pb-2 last:pb-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        isReceived ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#f4f4f5] text-[#71717a]"
                      }`}>
                        {isReceived ? "↓ in" : "↑ out"}
                      </span>
                      <p className="text-[12px] font-semibold text-black truncate flex-1" title={e.subject ?? ""}>
                        {e.subject || "(no subject)"}
                      </p>
                    </div>
                    <p className="text-[10px] text-[#a1a1aa]">
                      {new Date(e.createdAt).toLocaleString()}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function FilesTab({ documents }: { documents: ContactDocument[] }) {
  if (documents.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#e4e4e7] p-8 text-center text-[13px] text-[#a1a1aa]">
        No files attached yet. Anything the customer uploads in the funnel or sends as an email attachment shows up here.
      </div>
    );
  }

  function fmtSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function labelFor(type: string) {
    if (type === "BANK_STATEMENT_90D") return { text: "Bank statement", bg: "bg-[#dcfce7]", color: "text-[#15803d]" };
    if (type === "REPLY_ATTACHMENT") return { text: "Email attachment", bg: "bg-[#e0e7ff]", color: "text-[#3730a3]" };
    if (type === "PAY_STUB") return { text: "Pay stub", bg: "bg-[#fef3c7]", color: "text-[#92400e]" };
    if (type === "PLAID_ASSET_REPORT_PDF") return { text: "Plaid Asset Report", bg: "bg-[#e0e7ff]", color: "text-[#3730a3]" };
    if (type === "SIGNED_AGREEMENT_PDF") return { text: "Signed Agreement", bg: "bg-[#dcfce7]", color: "text-[#15803d]" };
    return { text: type, bg: "bg-[#f4f4f5]", color: "text-[#71717a]" };
  }

  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-hidden">
      <ul className="divide-y divide-[#f4f4f5]">
        {documents.map((d) => {
          const tag = labelFor(d.documentType);
          return (
            <li key={d.id} className="flex items-center justify-between gap-3 p-4 hover:bg-[#fafafa]">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f0f5f0] shrink-0">
                  <svg className="h-5 w-5 text-[#15803d]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-[13px] font-semibold text-black truncate">{d.fileName}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${tag.bg} ${tag.color} whitespace-nowrap`}>
                      {tag.text}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#a1a1aa]">
                    {fmtSize(d.fileSize)} · uploaded {new Date(d.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <a
                href={`/api/files/${d.storagePath}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-50 whitespace-nowrap"
              >
                View
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
