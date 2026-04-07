"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { TiptapEditor } from "@/components/content/tiptap-editor";
import { createEmailTemplate, updateEmailTemplate } from "@/actions/email";

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
