"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PIPELINE_STAGES } from "@/lib/contact-helpers";
import {
  updateContactStage,
  assignContactRep,
  addContactTag,
  removeContactTag,
} from "@/actions/contacts";
import { logActivity, getActivities } from "@/actions/activities";
import {
  sendCrmEmail,
  getCrmEmailTemplates,
  polishReplyWithAI,
  type CrmEmailTemplate,
} from "@/actions/crm-email";
import { sendSmsToContact } from "@/actions/sms";
import type { CustomerCrm } from "@/components/admin/customer-crm-panel";

/* ─── types ─────────────────────────────────────────────────────────── */

export type SfApplicant = {
  firstName: string;
  lastName: string;
  applicationCode: string;
  status: string;
  loanAmount: number;
  fundedAmount: number | null;
};

type Activity = {
  id: string;
  type: string;
  title: string;
  details: string | null;
  performedBy: string | null;
  createdAt: string;
};

type ComposerTab = "email" | "note" | "call";

/* ─── helpers ────────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/* ─── SVG icons (inline heroicons-style) ────────────────────────────── */

function IconEmail({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  );
}

function IconSms({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
    </svg>
  );
}

function IconNote({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

function IconPhone({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
    </svg>
  );
}

function IconFlag({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
    </svg>
  );
}

function IconChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      className={`transition-transform ${open ? "rotate-90" : ""} ${className ?? ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
}

/* ─── timeline icon by activity type ────────────────────────────────── */

type IconMeta = { bg: string; icon: React.ReactNode };

function getActivityIcon(type: string): IconMeta {
  const sz = "h-3.5 w-3.5 text-white";
  switch (type) {
    case "email_sent":
      return { bg: "bg-[#1589ee]", icon: <IconEmail className={sz} /> };
    case "email_received":
      return { bg: "bg-[#1589ee]", icon: <IconEmail className={sz} /> };
    case "sms_sent":
      return { bg: "bg-[#2e844a]", icon: <IconSms className={sz} /> };
    case "note_added":
    case "note":
      return { bg: "bg-[#706e6b]", icon: <IconNote className={sz} /> };
    case "call_logged":
    case "call":
      return { bg: "bg-[#9050e9]", icon: <IconPhone className={sz} /> };
    case "stage_changed":
    case "rep_assigned":
      return { bg: "bg-[#fe9339]", icon: <IconFlag className={sz} /> };
    default:
      return { bg: "bg-[#aeabab]", icon: <span className="w-2 h-2 rounded-full bg-white inline-block" /> };
  }
}

/* ─── shared input style ────────────────────────────────────────────── */

const inputCls =
  "w-full rounded border border-[#dddbda] bg-white px-3 py-2 text-[13px] text-[#080707] placeholder:text-[#aeabab] focus:outline-none focus:border-[#0176d3] focus:ring-1 focus:ring-[#0176d3]";

/* ─── sub-components ─────────────────────────────────────────────────── */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#706e6b] mb-0.5">
      {children}
    </p>
  );
}

/* ─── Activity Timeline ──────────────────────────────────────────────── */

function ActivityTimeline({ activities }: { activities: Activity[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (activities.length === 0) {
    return (
      <p className="text-[13px] text-[#aeabab] py-4 text-center">No activity yet.</p>
    );
  }

  return (
    <div className="relative">
      {/* vertical rail */}
      <div className="absolute left-[15px] top-3 bottom-3 w-px bg-[#dddbda]" />

      <ul className="space-y-4">
        {activities.map((a) => {
          const { bg, icon } = getActivityIcon(a.type);
          const isOpen = expanded[a.id] ?? false;

          /* subject display: strip "Email: " prefix, add Inbound prefix */
          let title = a.title;
          if (a.type === "email_sent" || a.type === "email_received") {
            title = title.replace(/^Email:\s*/i, "").replace(/^Re:\s*/i, "");
            if (a.type === "email_received") title = `Inbound: ${title}`;
          }

          const hasDetails = Boolean(a.details);
          const looksHtml = hasDetails && /<[a-z][\s\S]*>/i.test(a.details ?? "");

          return (
            <li key={a.id} className="flex gap-3">
              {/* icon circle */}
              <div
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bg}`}
              >
                {icon}
              </div>

              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[13px] font-semibold text-[#080707] leading-snug">{title}</span>
                  <span className="text-[11px] text-[#aeabab] whitespace-nowrap shrink-0 mt-0.5">
                    {relativeTime(a.createdAt)}
                  </span>
                </div>

                <p className="text-[11px] text-[#706e6b] mt-0.5">
                  {a.performedBy ?? "System"}
                </p>

                {hasDetails && (
                  <button
                    type="button"
                    onClick={() => setExpanded((p) => ({ ...p, [a.id]: !p[a.id] }))}
                    className="mt-1 flex items-center gap-1 text-[11px] text-[#0176d3] hover:underline"
                  >
                    <IconChevron open={isOpen} className="h-3 w-3" />
                    {isOpen ? "Hide" : "Show"} details
                  </button>
                )}

                {isOpen && hasDetails && (
                  <div className="mt-2 rounded border border-[#dddbda] bg-[#f3f2f3] px-3 py-2.5 text-[12px] text-[#080707] leading-relaxed">
                    {looksHtml ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: a.details ?? "" }}
                        className="prose prose-sm max-w-none text-[12px]"
                      />
                    ) : (
                      <p className="whitespace-pre-wrap">{a.details}</p>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─── Email Composer ────────────────────────────────────────────────── */

function EmailComposer({
  contactId,
  email,
  onPosted,
}: {
  contactId: string;
  email: string | null;
  onPosted: () => void;
}) {
  const [templates, setTemplates] = useState<CrmEmailTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [sending, setSending] = useState(false);
  const [draftNotes, setDraftNotes] = useState("");

  useEffect(() => {
    getCrmEmailTemplates().then(setTemplates);
  }, []);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((t) => t.id === id);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  }

  async function handlePolish() {
    if (!draftNotes.trim()) {
      toast.error("Enter a draft / talking points to polish");
      return;
    }
    setPolishing(true);
    try {
      const r = await polishReplyWithAI({ contactId, draftNotes });
      if (r.ok) {
        setSubject(r.subject ?? subject);
        setBody(r.body ?? body);
        toast.success("Polished with AI");
      } else {
        toast.error("AI polish failed");
      }
    } catch {
      toast.error("AI polish failed");
    } finally {
      setPolishing(false);
    }
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body are required");
      return;
    }
    setSending(true);
    try {
      const r = await sendCrmEmail({ contactId, subject, body });
      if (r && (r as any).error) {
        toast.error((r as any).error);
      } else {
        toast.success("Email sent");
        setTemplateId("");
        setSubject("");
        setBody("");
        setDraftNotes("");
        onPosted();
      }
    } catch {
      toast.error("Failed to send email");
    } finally {
      setSending(false);
    }
  }

  if (!email) {
    return (
      <p className="text-[13px] text-[#aeabab] py-2">No email on file — cannot send.</p>
    );
  }

  return (
    <div className="space-y-3">
      {/* template picker */}
      {templates.length > 0 && (
        <select
          value={templateId}
          onChange={(e) => applyTemplate(e.target.value)}
          className={inputCls}
        >
          <option value="">Use a template...</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      <input
        type="text"
        placeholder="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className={inputCls}
      />

      <textarea
        placeholder="Email body (HTML or plain text)..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        className={`${inputCls} resize-none`}
      />

      {/* AI polish row */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Draft notes for AI polish (optional)..."
          value={draftNotes}
          onChange={(e) => setDraftNotes(e.target.value)}
          className={inputCls}
        />
        <button
          type="button"
          onClick={handlePolish}
          disabled={polishing || !draftNotes.trim()}
          className="shrink-0 rounded border border-[#dddbda] bg-white px-3 py-2 text-[12px] font-semibold text-[#0176d3] hover:bg-[#f3f2f3] disabled:opacity-40"
        >
          {polishing ? "Polishing..." : "AI Polish"}
        </button>
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={sending || !subject.trim() || !body.trim()}
        className="w-full rounded bg-[#0176d3] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#015ba7] disabled:opacity-50"
      >
        {sending ? "Sending..." : "Send Email"}
      </button>
    </div>
  );
}

/* ─── Note Composer ─────────────────────────────────────────────────── */

function NoteComposer({
  contactId,
  onPosted,
}: {
  contactId: string;
  onPosted: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const t = text.trim();
    if (!t) return;
    setSaving(true);
    try {
      await logActivity({ contactId, type: "note_added", title: "Note", details: t });
      toast.success("Note saved");
      setText("");
      onPosted();
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        placeholder="Type your note..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className={`${inputCls} resize-none`}
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !text.trim()}
        className="w-full rounded bg-[#0176d3] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#015ba7] disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Note"}
      </button>
    </div>
  );
}

/* ─── Call Composer ─────────────────────────────────────────────────── */

function CallComposer({
  contactId,
  onPosted,
}: {
  contactId: string;
  onPosted: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleLog() {
    setSaving(true);
    try {
      await logActivity({
        contactId,
        type: "call_logged",
        title: "Call logged",
        details: text.trim() || undefined,
      });
      toast.success("Call logged");
      setText("");
      onPosted();
    } catch {
      toast.error("Failed to log call");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        placeholder="What happened on the call? (optional)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className={`${inputCls} resize-none`}
      />
      <button
        type="button"
        onClick={handleLog}
        disabled={saving}
        className="w-full rounded bg-[#0176d3] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#015ba7] disabled:opacity-50"
      >
        {saving ? "Logging..." : "Log Call"}
      </button>
    </div>
  );
}

/* ─── Main export: SalesforceRecord ─────────────────────────────────── */

export function SalesforceRecord({
  crm,
  applicant,
}: {
  crm: CustomerCrm & { email: string | null; phone: string | null };
  applicant: SfApplicant;
}) {
  const router = useRouter();

  /* local state */
  const [stage, setStage] = useState(crm.stage);
  const [repId, setRepId] = useState(crm.assignedRepId ?? "");
  const [activities, setActivities] = useState<Activity[]>(crm.activities);
  const [activeTab, setActiveTab] = useState<ComposerTab>("email");

  /* refs for scroll-to actions */
  const composerRef = useRef<HTMLDivElement>(null);

  function scrollToComposer(tab: ComposerTab) {
    setActiveTab(tab);
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function refetchActivities() {
    const fresh = await getActivities(crm.contactId, 50);
    setActivities(
      fresh.map((a) => ({
        ...a,
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
        details: a.details ?? null,
        performedBy: a.performedBy ?? null,
      }))
    );
  }

  async function handleStageChange(newStage: string) {
    setStage(newStage);
    try {
      await updateContactStage(crm.contactId, newStage);
      toast.success("Stage updated");
      router.refresh();
    } catch {
      toast.error("Failed to update stage");
      setStage(crm.stage);
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

  async function onPosted() {
    await refetchActivities();
  }

  /* ── SLDS card style ── */
  const card = "bg-white rounded border border-[#dddbda]";

  return (
    <div className="space-y-4">
      {/* ─────────────────────────────────────────────────────────────
          A) HIGHLIGHTS PANEL
      ──────────────────────────────────────────────────────────────── */}
      <div className={`${card} p-5`}>
        {/* record name + code/status */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-[18px] font-bold text-[#080707] leading-tight">
              {applicant.firstName} {applicant.lastName}
            </h2>
            <p className="text-[12px] text-[#706e6b] mt-0.5">
              {applicant.applicationCode} &middot; {applicant.status}
            </p>
          </div>

          {/* action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scrollToComposer("email")}
              className="rounded border border-[#dddbda] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0176d3] hover:bg-[#f3f2f3] transition-colors"
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => scrollToComposer("note")}
              className="rounded border border-[#dddbda] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0176d3] hover:bg-[#f3f2f3] transition-colors"
            >
              New Note
            </button>
            <button
              type="button"
              onClick={() => scrollToComposer("call")}
              className="rounded border border-[#dddbda] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0176d3] hover:bg-[#f3f2f3] transition-colors"
            >
              Log a Call
            </button>
          </div>
        </div>

        {/* compact field row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
          {/* Stage — editable select */}
          <div>
            <FieldLabel>Stage</FieldLabel>
            <select
              value={stage}
              onChange={(e) => handleStageChange(e.target.value)}
              className="mt-0.5 w-full rounded border border-[#dddbda] bg-white px-2 py-1 text-[13px] text-[#080707] focus:outline-none focus:border-[#0176d3] focus:ring-1 focus:ring-[#0176d3]"
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <FieldLabel>Amount</FieldLabel>
            <p className="text-[13px] font-semibold text-[#080707] mt-0.5">
              {fmtMoney(applicant.fundedAmount ?? applicant.loanAmount)}
              {applicant.fundedAmount && applicant.fundedAmount !== applicant.loanAmount && (
                <span className="text-[#706e6b] font-normal">
                  {" "}/ {fmtMoney(applicant.loanAmount)} req
                </span>
              )}
            </p>
          </div>

          {/* Email */}
          <div>
            <FieldLabel>Email</FieldLabel>
            {crm.email ? (
              <a
                href={`mailto:${crm.email}`}
                className="text-[13px] text-[#0176d3] hover:underline mt-0.5 block truncate"
              >
                {crm.email}
              </a>
            ) : (
              <p className="text-[13px] text-[#aeabab] mt-0.5">None on file</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <FieldLabel>Phone</FieldLabel>
            {crm.phone ? (
              <a
                href={`tel:${crm.phone}`}
                className="text-[13px] text-[#0176d3] hover:underline mt-0.5 block"
              >
                {crm.phone}
              </a>
            ) : (
              <p className="text-[13px] text-[#aeabab] mt-0.5">None on file</p>
            )}
          </div>

          {/* Owner — editable select */}
          <div>
            <FieldLabel>Owner</FieldLabel>
            <select
              value={repId}
              onChange={(e) => handleRepChange(e.target.value)}
              className="mt-0.5 w-full rounded border border-[#dddbda] bg-white px-2 py-1 text-[13px] text-[#080707] focus:outline-none focus:border-[#0176d3] focus:ring-1 focus:ring-[#0176d3]"
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

        {/* Tags row */}
        {crm.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {crm.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-[#f3f2f3] px-2.5 py-0.5 text-[11px] font-medium text-[#706e6b]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          B) ACTIVITY COMPOSER (publisher)
      ──────────────────────────────────────────────────────────────── */}
      <div className={card} ref={composerRef}>
        {/* tab strip */}
        <div className="flex border-b border-[#dddbda]">
          {(
            [
              { id: "email" as ComposerTab, label: "Email" },
              { id: "note" as ComposerTab, label: "Note" },
              { id: "call" as ComposerTab, label: "Log a Call" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-5 py-3 text-[13px] font-semibold border-b-2 transition-colors ${
                activeTab === id
                  ? "border-[#0176d3] text-[#0176d3]"
                  : "border-transparent text-[#706e6b] hover:text-[#080707]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === "email" && (
            <EmailComposer
              contactId={crm.contactId}
              email={crm.email}
              onPosted={onPosted}
            />
          )}
          {activeTab === "note" && (
            <NoteComposer contactId={crm.contactId} onPosted={onPosted} />
          )}
          {activeTab === "call" && (
            <CallComposer contactId={crm.contactId} onPosted={onPosted} />
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          C) ACTIVITY TIMELINE
      ──────────────────────────────────────────────────────────────── */}
      <div className={card}>
        <div className="px-5 pt-4 pb-2 border-b border-[#dddbda]">
          <h3 className="text-[13px] font-bold text-[#080707] uppercase tracking-[0.04em]">
            Activity
          </h3>
        </div>
        <div className="px-5 py-4">
          <ActivityTimeline activities={activities} />
        </div>
      </div>
    </div>
  );
}
