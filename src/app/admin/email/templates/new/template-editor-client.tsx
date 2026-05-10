"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { TiptapEditor } from "@/components/content/tiptap-editor";
import { createEmailTemplate, updateEmailTemplate, sendTestEmail } from "@/actions/email";

const CATEGORIES = [
  { value: "transactional", label: "Transactional" },
  { value: "marketing", label: "Marketing" },
  { value: "sequence", label: "Sequence" },
];

interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string | null;
}

interface Props {
  template?: Template;
}

export function TemplateEditorClient({ template }: Props) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [category, setCategory] = useState(template?.category ?? "marketing");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !subject.trim()) { toast.error("Name and subject are required"); return; }
    setSaving(true);
    try {
      if (template?.id) {
        await updateEmailTemplate(template.id, { name, subject, body, category });
        toast.success("Template updated");
      } else {
        await createEmailTemplate({ name, subject, body, category });
        toast.success("Template created");
      }
      router.push("/admin/email/templates");
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={template ? "Edit Template" : "New Template"}
        description="Create a reusable email template"
      />

      <div className="grid grid-cols-[1fr_280px] gap-6">
        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-2">Template Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Welcome Email"
              className="w-full bg-[#f4f4f5] rounded-xl px-4 py-3 text-[14px] text-black placeholder:text-[#a1a1aa] focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-2">Subject Line</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Welcome to Coastal Debt Relief"
              className="w-full bg-[#f4f4f5] rounded-xl px-4 py-3 text-[14px] text-black placeholder:text-[#a1a1aa] focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-2">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[#f4f4f5] rounded-xl px-4 py-3 text-[14px] text-black focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
            >
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {/* Body */}
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-2">Email Body</label>
            <div className="bg-white border border-[#e4e4e7] rounded-xl overflow-hidden">
              <TiptapEditor content={body} onChange={setBody} placeholder="Write your email template..." />
            </div>
            <SendTestButton subject={subject} body={body} />
          </div>
        </div>

        {/* Sidebar */}
        <div>
          <div className="bg-white border border-[#e4e4e7] rounded-xl p-5">
            <h3 className="text-[13px] font-bold text-black mb-4">Save Template</h3>
            <button
              onClick={save}
              disabled={saving}
              className="w-full bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Template"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SendTestButton({ subject, body }: { subject: string; body: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!email.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body must be set before sending a test");
      return;
    }
    setSending(true);
    try {
      const r = await sendTestEmail({ to: email, subject, body });
      if (r.ok) {
        toast.success(`Test sent to ${email}`);
        setOpen(false);
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#15803d] hover:text-[#166534]"
      >
        ✉ Send test email
      </button>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#f0fdf4] border border-[#dcfce7] px-3 py-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="flex-1 bg-white rounded px-2.5 py-1.5 text-[12px] border border-[#dcfce7] focus:outline-none focus:ring-1 focus:ring-[#15803d]/40"
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={sending}
        className="rounded bg-[#15803d] text-white px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50 hover:bg-[#166534]"
      >
        {sending ? "Sending…" : "Send"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[12px] text-[#71717a] hover:text-black"
      >
        Cancel
      </button>
    </div>
  );
}
