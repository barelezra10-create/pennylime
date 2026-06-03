"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TabBar } from "@/components/admin/tab-bar";
import { StageBadge } from "@/components/admin/stage-badge";
import { StatusBadge } from "@/components/admin/status-badge";
import { PageHeader } from "@/components/admin/page-header";
import { updateContactStage, assignContactRep, addContactTag, removeContactTag } from "@/actions/contacts";
import { archiveContact, unarchiveContact, deleteContact } from "@/actions/archive";
import { logActivity } from "@/actions/activities";
import { sendCrmEmail, getCrmEmailTemplates, getRecentEmailsForContact, polishReplyWithAI, getEmailThread, type CrmEmailTemplate } from "@/actions/crm-email";
import { syncIncreaseForApplication, type IncreaseTransferRow } from "@/actions/sync-increase-status";
import { previewPortalAs } from "@/actions/portal-preview";
import { getTopUpRequestsForApplication, setTopUpRequestStatus, type AdminTopUpRow } from "@/actions/topup-admin";

type EmailThreadItem = {
  id: string;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
  performedBy: string | null;
  createdAt: string;
};
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
  offerStatus?: string | null;
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
  archivedAt?: string | null;
  tags: string[];
  activities: Activity[];
  application: Application | null;
  otherApplications?: OtherApplication[];
  loan: LoanSummary;
}

interface OtherApplication {
  id: string;
  applicationCode: string;
  status: string;
  loanAmount: number;
  fundedAmount: number | null;
  fundedAt: string | null;
  createdAt: string;
  rejectionReason: string | null;
  payments: Array<{
    paymentNumber: number;
    amount: number;
    principal: number;
    status: string;
    dueDate: string | null;
    paidAt: string | null;
  }>;
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
      <div className="flex items-start justify-between gap-3 mb-2">
        <PageHeader
          title={fullName}
          description={contact.email}
        />
        <ContactArchiveActions
          contactId={contact.id}
          archived={!!contact.archivedAt}
          hasLinkedApplication={!!contact.application}
        />
      </div>
      {contact.archivedAt && (
        <div className="mb-4 rounded-lg border border-[#e4e4e7] bg-[#fafafa] p-3 text-[12px] text-[#71717a]">
          This contact was archived on {new Date(contact.archivedAt).toLocaleString()}. It's hidden from the default Contacts list. Click "Unarchive" above to restore.
        </div>
      )}

      {contact.loan.hasLoan && <LoanSummaryCard loan={contact.loan} />}

      {contact.otherApplications && contact.otherApplications.length > 0 && (
        <OtherApplicationsCard
          others={contact.otherApplications}
          activeApplicationId={contact.application?.id ?? null}
        />
      )}

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
        <div className="max-w-3xl space-y-5">
          {contact.application ? (
            <>
            <div className="bg-white rounded-xl p-6 border border-[#e4e4e7] space-y-4">
              <h2 className="text-[13px] font-bold text-black uppercase tracking-[0.05em]">Application</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className={labelClass}>Application Code</span>
                  <p className="text-[13px] font-mono text-black">{contact.application.applicationCode}</p>
                </div>
                <div>
                  <span className={labelClass}>Status</span>
                  <StatusBadge
                    status={contact.application.status}
                    offerStatus={contact.application.offerStatus}
                    size="sm"
                  />
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
              <div className="flex items-center gap-3 flex-wrap">
                <Link
                  href={`/admin/applications/${contact.application.id}`}
                  className="inline-flex items-center gap-1.5 text-[13px] text-[#15803d] font-medium hover:underline"
                >
                  View Full Application
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </Link>
                <PortalPreviewButton applicationId={contact.application.id} />
              </div>
            </div>
            <IncreaseTransfersPanel applicationId={contact.application.id} />
            <TopUpRequestsPanel applicationId={contact.application.id} />
            </>
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
  const [aiNotes, setAiNotes] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [thread, setThread] = useState<EmailThreadItem[]>([]);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);

  async function refreshThread() {
    try {
      const t = await getEmailThread(contactId);
      setThread(t);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refreshThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  async function handlePolishWithAI() {
    if (!aiNotes.trim()) {
      toast.error("Write a few words first, then I can polish them.");
      return;
    }
    setPolishing(true);
    const t = toast.loading("Polishing reply with Gemini…");
    try {
      const r = await polishReplyWithAI({ contactId, draftNotes: aiNotes });
      if (r.ok) {
        setSubject(r.subject);
        setBody(r.body);
        toast.success("Polished. Review before sending.", { id: t });
        // Clear the rough notes so the next polish round is fresh.
        setAiNotes("");
      } else {
        toast.error(r.error, { id: t });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Polish failed", { id: t });
    } finally {
      setPolishing(false);
    }
  }

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
        await refreshThread();
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

          {/* AI polish — type rough notes, Gemini rewrites into a polished
              email body + subject. Pulls the customer's last inbound
              message for grounding so the reply matches the conversation. */}
          <div className="mb-4 rounded-xl border border-[#15803d]/30 bg-[#f0fdf4] p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#15803d]">
                ✦ Quick reply with AI
              </label>
              <span className="text-[10px] text-[#71717a]">Type a few words, Gemini polishes</span>
            </div>
            <textarea
              value={aiNotes}
              onChange={(e) => setAiNotes(e.target.value)}
              rows={2}
              placeholder='e.g. "yes approved 1500, send the offer link" or "ask him to upload bank statements"'
              className="w-full text-[13px] px-3.5 py-2.5 bg-white rounded-lg border border-[#15803d]/20 focus:outline-none focus:ring-2 focus:ring-[#15803d]/30 mb-2"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePolishWithAI}
                disabled={polishing || !aiNotes.trim()}
                className="rounded-lg bg-[#15803d] text-white text-[12px] font-semibold px-3.5 py-2 hover:bg-[#166534] disabled:opacity-50 transition-colors"
              >
                {polishing ? "Polishing…" : "✨ Polish with AI"}
              </button>
              <span className="text-[11px] text-[#71717a]">
                Reads the customer's last message + your notes, writes a clean reply.
              </span>
            </div>
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
        {/* Email conversation — click any row to expand and read the
            full body. Inbound emails carry the customer's message
            (from Activity.details via the inbound-email webhook);
            outbound emails show what we sent. */}
        <div className="bg-white rounded-xl p-5 border border-[#e4e4e7]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-bold text-black uppercase tracking-[0.05em]">
              Email conversation
            </h3>
            <button
              type="button"
              onClick={refreshThread}
              className="text-[11px] font-semibold text-[#15803d] hover:underline"
            >
              Refresh
            </button>
          </div>

          {thread.length === 0 ? (
            <p className="text-[12px] text-[#a1a1aa]">No emails yet. Send one below to start the conversation.</p>
          ) : (
            <ul className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {thread.map((msg) => {
                const isInbound = msg.direction === "inbound";
                const isExpanded = expandedThreadId === msg.id;
                return (
                  <li
                    key={msg.id}
                    className={`rounded-lg border ${isInbound ? "bg-[#f7fbf8] border-[#dcfce7]" : "bg-[#fafafa] border-[#e4e4e7]"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedThreadId(isExpanded ? null : msg.id)}
                      className="w-full text-left p-3"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            isInbound
                              ? "bg-[#15803d] text-white"
                              : "bg-[#71717a] text-white"
                          }`}
                        >
                          {isInbound ? "↓ FROM CUSTOMER" : "↑ FROM YOU"}
                        </span>
                        <span className="text-[10px] text-[#a1a1aa] ml-auto">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-[12.5px] font-semibold text-[#0a0a0a] truncate" title={msg.subject}>
                        {msg.subject}
                      </p>
                      {!isExpanded && msg.body && (
                        <p className="text-[11.5px] text-[#71717a] mt-0.5 line-clamp-1">
                          {msg.body.replace(/<[^>]+>/g, " ").trim().slice(0, 90)}
                          {msg.body.length > 90 ? "…" : ""}
                        </p>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-[#f4f4f5]">
                        {msg.body ? (
                          /<[a-z][\s\S]*>/i.test(msg.body) ? (
                            <div
                              className="text-[12.5px] text-[#1a1a1a] leading-relaxed prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: msg.body }}
                            />
                          ) : (
                            <div className="text-[12.5px] text-[#1a1a1a] leading-relaxed whitespace-pre-wrap font-mono">
                              {msg.body}
                            </div>
                          )
                        ) : (
                          <p className="text-[11px] text-[#a1a1aa] italic">No body captured.</p>
                        )}
                        {isInbound && (
                          <button
                            type="button"
                            onClick={() => {
                              // Pre-fill subject as "Re: …" + scroll to top
                              setSubject(`Re: ${msg.subject.replace(/^Re:\s*/i, "")}`);
                              setExpandedThreadId(null);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[#15803d] hover:underline"
                          >
                            ↑ Reply
                          </button>
                        )}
                      </div>
                    )}
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
                href={`/api/files/${encodeURIComponent(d.storagePath)}`}
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

function ContactArchiveActions({
  contactId,
  archived,
  hasLinkedApplication,
}: {
  contactId: string;
  archived: boolean;
  hasLinkedApplication: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"archive" | "delete" | null>(null);

  async function handleArchive() {
    setBusy("archive");
    try {
      if (archived) {
        await unarchiveContact(contactId);
        toast.success("Contact restored");
      } else {
        await archiveContact(contactId);
        toast.success("Contact archived");
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (hasLinkedApplication) {
      toast.error("This contact has a linked application — archive instead.");
      return;
    }
    if (!confirm("Permanently delete this contact and all their activity / emails / tags? Can't be undone.")) return;
    setBusy("delete");
    try {
      const r = await deleteContact(contactId);
      if (r.ok) {
        toast.success("Contact deleted");
        router.push("/admin/contacts");
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2 mt-1 shrink-0">
      <button
        type="button"
        onClick={handleArchive}
        disabled={busy !== null}
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#71717a] hover:bg-gray-50 hover:text-black disabled:opacity-50"
      >
        {busy === "archive" ? "…" : archived ? "Unarchive" : "Archive"}
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy !== null || hasLinkedApplication}
        title={hasLinkedApplication ? "Can't delete a contact with a linked application — archive instead." : "Delete permanently"}
        className="rounded-lg border border-[#dc2626]/30 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#dc2626] hover:bg-[#fff1f2] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy === "delete" ? "…" : "Delete"}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * IncreaseTransfersPanel
 * Pulls live ACH transfer statuses from Increase for an application:
 * the funding credit (money out the door) + every weekly debit
 * (repayments). Auto-fetches on mount; manual Refresh button forces
 * a re-sync. Each row also persists the latest status back to the DB
 * so subsequent loads start from a recent snapshot.
 * ───────────────────────────────────────────────────────────────── */

function IncreaseTransfersPanel({ applicationId }: { applicationId: string }) {
  const [rows, setRows] = useState<IncreaseTransferRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    const r = await syncIncreaseForApplication(applicationId);
    if (r.ok) {
      setRows(r.rows);
      setLastSync(new Date());
    } else {
      setError(r.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // refresh on mount only; manual refresh covers updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const disbursement = rows?.find((r) => r.kind === "disbursement");
  const repayments = rows?.filter((r) => r.kind === "repayment") || [];

  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[13px] font-bold text-black uppercase tracking-[0.05em]">Increase transfers</h2>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e4e7] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#15803d] hover:bg-[#f0fdf4] disabled:opacity-50"
        >
          <svg className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          {loading ? "Syncing..." : "Refresh"}
        </button>
      </div>
      <p className="text-[11px] text-[#71717a] mb-4">
        Live status pulled from Increase. {lastSync ? `Last synced ${lastSync.toLocaleTimeString()}.` : ""}
      </p>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-800">{error}</div>
      ) : !rows ? (
        <p className="text-[12px] text-[#a1a1aa]">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-[#a1a1aa]">No Increase transfers yet for this application.</p>
      ) : (
        <div className="space-y-4">
          {disbursement && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#71717a] mb-2">Disbursement (money out)</h3>
              <TransferRow row={disbursement} />
            </div>
          )}
          {repayments.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#71717a] mb-2">
                Repayments (money in) <span className="text-[#a1a1aa] ml-1">{repayments.length} of {repayments.length}</span>
              </h3>
              <div className="space-y-1.5">
                {repayments.map((r) => (
                  <TransferRow key={`${r.transferId || r.paymentNumber}`} row={r} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TransferRow({ row }: { row: IncreaseTransferRow }) {
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#f4f4f5] bg-[#fafafa] px-3 py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        {row.kind === "repayment" && (
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white border border-[#e4e4e7] text-[11px] font-bold text-[#52525b]">
            {row.paymentNumber}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-black tabular-nums">{fmt(row.amount)}</div>
          <div className="text-[11px] text-[#71717a] font-mono truncate max-w-[280px]">
            {row.transferId || (row.kind === "repayment" ? "not yet attempted" : "no transfer id")}
            {row.kind === "repayment" && row.dueDate ? ` · due ${fmtDate(row.dueDate)}` : ""}
            {row.kind === "repayment" && row.paidAt ? ` · paid ${fmtDate(row.paidAt)}` : ""}
          </div>
          {row.error && (
            <div className="text-[10px] text-red-600 mt-0.5">{row.error}</div>
          )}
        </div>
      </div>
      <IncreaseStatusPill status={row.status} fresh={row.fetchedFromIncrease} />
    </div>
  );
}

function IncreaseStatusPill({ status, fresh }: { status: string; fresh: boolean }) {
  // Increase ACH transfer statuses, see https://increase.com/documentation/api
  const map: Record<string, { bg: string; text: string; label: string }> = {
    pending_approval:    { bg: "bg-amber-50",  text: "text-amber-700",  label: "Pending approval" },
    pending_submission:  { bg: "bg-amber-50",  text: "text-amber-700",  label: "Pending submission" },
    pending_reviewing:   { bg: "bg-amber-50",  text: "text-amber-700",  label: "Reviewing" },
    submitted:           { bg: "bg-blue-50",   text: "text-blue-700",   label: "Submitted" },
    submitting:          { bg: "bg-blue-50",   text: "text-blue-700",   label: "Submitting" },
    pending_returning:   { bg: "bg-amber-50",  text: "text-amber-700",  label: "Pending return" },
    returned:            { bg: "bg-red-50",    text: "text-red-700",    label: "Returned" },
    canceled:            { bg: "bg-stone-100", text: "text-stone-600",  label: "Canceled" },
    rejected:            { bg: "bg-red-50",    text: "text-red-700",    label: "Rejected" },
    requires_attention:  { bg: "bg-red-50",    text: "text-red-700",    label: "Needs attention" },
    posted:              { bg: "bg-green-50",  text: "text-green-700",  label: "Posted" },
    PAID:                { bg: "bg-green-50",  text: "text-green-700",  label: "Paid" },
    PENDING:             { bg: "bg-stone-100", text: "text-stone-600",  label: "Pending" },
    PROCESSING:          { bg: "bg-blue-50",   text: "text-blue-700",   label: "Processing" },
    FAILED:              { bg: "bg-red-50",    text: "text-red-700",    label: "Failed" },
  };
  const c = map[status] || { bg: "bg-stone-100", text: "text-stone-600", label: status || "unknown" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.bg} ${c.text} whitespace-nowrap`}>
      {fresh && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />}
      {c.label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * PortalPreviewButton
 * Drops the admin into the customer portal as if they were the
 * applicant. Useful for QA — see the portal exactly as the customer
 * sees it without spinning up a test phone or fishing a Twilio code
 * out of the logs. Audit-logged server-side. Cookie persists 30 days
 * (same as a real customer sign-in) — sign out from /portal to clear.
 * ───────────────────────────────────────────────────────────────── */

function PortalPreviewButton({ applicationId }: { applicationId: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        toast.loading("Signing into portal...", { id: "portal-preview" });
        const r = await previewPortalAs(applicationId);
        toast.dismiss("portal-preview");
        if (r.ok) {
          toast.success(`Previewing as ${r.firstName} ${r.lastName || ""}`);
          window.open("/portal", "_blank", "noopener,noreferrer");
        } else {
          toast.error(r.error || "Failed to start preview");
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[#15803d] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#15803d] hover:bg-[#f0fdf4] transition-colors"
      title="Sign into the customer portal as this applicant - opens in a new tab"
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
      View as customer
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * TopUpRequestsPanel
 * Lists pending + historical "request more advance" submissions from
 * the customer portal. Admin can Approve / Decline each PENDING one
 * with an optional note. Approval here is a soft confirmation — the
 * admin still has to clone the application data and run the new
 * advance through the offer flow manually.
 * ───────────────────────────────────────────────────────────────── */

function TopUpRequestsPanel({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<AdminTopUpRow[] | null>(null);

  useEffect(() => {
    getTopUpRequestsForApplication(applicationId).then(setRows);
  }, [applicationId]);

  if (!rows) {
    return null;
  }
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-6">
      <h2 className="text-[13px] font-bold text-black uppercase tracking-[0.05em] mb-4">Top-up requests</h2>
      <div className="space-y-3">
        {rows.map((r) => {
          const created = new Date(r.createdAt);
          const isPending = r.status === "PENDING";
          const statusColor =
            r.status === "APPROVED" ? "bg-[#f0fdf4] text-[#15803d]" :
            r.status === "DECLINED" ? "bg-red-50 text-red-700" :
            r.status === "FUNDED" ? "bg-[#f0fdf4] text-[#15803d]" :
            "bg-amber-50 text-amber-800";
          return (
            <div key={r.id} className="rounded-lg border border-[#e4e4e7] p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[18px] font-bold text-black tabular-nums">
                    ${r.requestedAmount.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[#71717a] mt-0.5">
                    requested {created.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusColor}`}>
                  {r.status}
                </span>
              </div>
              {r.adminNote && (
                <p className="mt-3 text-[12px] text-[#52525b] border-l-2 border-[#e4e4e7] pl-3">
                  {r.adminNote}
                </p>
              )}
              {r.reviewedBy && r.reviewedAt && (
                <p className="mt-2 text-[11px] text-[#a1a1aa]">
                  Reviewed by {r.reviewedBy} on {new Date(r.reviewedAt).toLocaleDateString()}
                </p>
              )}
              {isPending && (
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={async () => {
                      const note = window.prompt("Optional note for the customer (leave blank to skip):") || undefined;
                      const res = await setTopUpRequestStatus({ requestId: r.id, status: "APPROVED", adminNote: note });
                      if (res.ok) {
                        toast.success("Approved");
                        const fresh = await getTopUpRequestsForApplication(applicationId);
                        setRows(fresh);
                        router.refresh();
                      } else {
                        toast.error(res.error);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803d] hover:bg-[#166534] text-white text-[12px] font-semibold px-3 py-1.5"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const note = window.prompt("Reason for declining (shown to customer):") || undefined;
                      const res = await setTopUpRequestStatus({ requestId: r.id, status: "DECLINED", adminNote: note });
                      if (res.ok) {
                        toast.success("Declined");
                        const fresh = await getTopUpRequestsForApplication(applicationId);
                        setRows(fresh);
                        router.refresh();
                      } else {
                        toast.error(res.error);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 text-[12px] font-semibold px-3 py-1.5"
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Other applications card ───────────────────────────────────────
// Shows every application from this borrower that ISN'T the currently
// linked primary one. Headline already shows the most-relevant active
// advance; this lists the rest (prior funded, paid off, rejected,
// in-progress alternates) so a repeat applicant's full history is
// visible from the Contact page.

function otherStatusTone(status: string): { bg: string; text: string } {
  switch (status) {
    case "FUNDED": return { bg: "bg-[#e8f5e9]", text: "text-[#15803d]" };
    case "PAID_OFF": return { bg: "bg-[#dcfce7]", text: "text-[#166534]" };
    case "LATE": return { bg: "bg-[#fef3c7]", text: "text-[#b45309]" };
    case "DEFAULTED": return { bg: "bg-[#fee2e2]", text: "text-[#dc2626]" };
    case "REJECTED": return { bg: "bg-[#fee2e2]", text: "text-[#dc2626]" };
    case "APPROVED": return { bg: "bg-[#dbeafe]", text: "text-[#1d4ed8]" };
    case "PENDING": return { bg: "bg-[#f4f4f5]", text: "text-[#52525b]" };
    default: return { bg: "bg-[#f4f4f5]", text: "text-[#52525b]" };
  }
}

function OtherApplicationsCard({
  others,
  activeApplicationId,
}: {
  others: OtherApplication[];
  activeApplicationId: string | null;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-5 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-bold text-black uppercase tracking-[0.05em]">
          All advances ({others.length + (activeApplicationId ? 1 : 0)})
        </h2>
        <span className="text-[11px] text-[#71717a]">{others.length} other</span>
      </div>
      <div className="space-y-2">
        {others.map((a) => {
          const tone = otherStatusTone(a.status);
          const total = a.payments.length;
          const paid = a.payments.filter((p) => p.status === "PAID").length;
          const paidPrincipal = a.payments
            .filter((p) => p.status === "PAID")
            .reduce((s, p) => s + p.principal, 0);
          const totalPrincipal = a.payments.reduce((s, p) => s + p.principal, 0);
          const outstanding = Math.max(0, totalPrincipal - paidPrincipal);
          const isActive = ["FUNDED", "LATE"].includes(a.status);
          return (
            <a
              key={a.id}
              href={`/admin/applications/${a.id}`}
              className="block rounded-lg border border-[#e4e4e7] hover:border-[#a1a1aa] hover:bg-[#fafafa] p-3 transition-colors"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[11px] font-semibold text-[#15803d] bg-[#f0f5f0] rounded px-1.5 py-0.5">
                    {a.applicationCode}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.bg} ${tone.text}`}>
                    {a.status}
                  </span>
                  <span className="text-[12px] text-[#52525b]">
                    ${a.loanAmount.toFixed(0)} requested
                    {a.fundedAmount != null && ` · $${a.fundedAmount.toFixed(0)} funded`}
                  </span>
                </div>
                <span className="text-[10px] text-[#a1a1aa]">
                  {a.fundedAt
                    ? `funded ${new Date(a.fundedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                    : `applied ${new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                </span>
              </div>
              {total > 0 && (
                <div className="mt-2 flex items-center gap-4 text-[11px] text-[#52525b]">
                  <span>{paid} / {total} paid</span>
                  {isActive && (
                    <span className="text-[#dc2626] font-semibold">
                      ${outstanding.toFixed(2)} outstanding
                    </span>
                  )}
                </div>
              )}
              {a.status === "REJECTED" && a.rejectionReason && (
                <p className="mt-1.5 text-[11px] text-[#dc2626]">Rejected: {a.rejectionReason}</p>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
