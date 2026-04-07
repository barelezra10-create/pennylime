"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createToolPage, updateToolPage, deleteToolPage } from "@/actions/content";
import { slugify } from "@/lib/content-helpers";
import { TabBar } from "@/components/admin/tab-bar";

const TOOL_COMPONENTS = [
  { value: "loan-calculator", label: "Loan Calculator" },
  { value: "income-estimator", label: "Income Estimator" },
  { value: "loan-comparison", label: "Loan Comparison" },
  { value: "dti-calculator", label: "DTI Calculator" },
  { value: "tax-estimator", label: "Tax Estimator" },
];

interface ToolFormData {
  id?: string;
  title: string;
  slug: string;
  description: string;
  toolComponent: string;
  body: string;
  metaTitle: string;
  metaDescription: string;
  published: boolean;
}

const TABS = [
  { id: "content", label: "Content" },
  { id: "seo", label: "SEO & Publish" },
];

export function ToolEditorClient({ tool }: { tool?: ToolFormData }) {
  const router = useRouter();
  const isEdit = !!tool?.id;
  const [activeTab, setActiveTab] = useState("content");
  const [form, setForm] = useState<ToolFormData>(
    tool || { title: "", slug: "", description: "", toolComponent: "loan-calculator", body: "", metaTitle: "", metaDescription: "", published: false }
  );
  const [saving, setSaving] = useState(false);

  function updateField(field: string, value: unknown) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "title" && !isEdit) next.slug = slugify(value as string);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    const { id, ...rest } = form;
    if (isEdit && tool?.id) { await updateToolPage(tool.id, rest); }
    else { await createToolPage(rest); }
    router.push("/admin/content/tools");
    router.refresh();
    setSaving(false);
  }

  async function handleDelete() {
    if (!tool?.id || !confirm("Delete this tool page?")) return;
    await deleteToolPage(tool.id);
    router.push("/admin/content/tools");
    router.refresh();
  }

  const inputClass = "w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg bg-white";
  const labelClass = "text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-1 block";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black">{isEdit ? `Edit: ${form.title}` : "New Tool Page"}</h1>
        <div className="flex gap-2">
          {isEdit && <button onClick={handleDelete} className="text-[13px] font-medium text-red-500 px-4 py-2 rounded-lg hover:bg-red-50">Delete</button>}
          <button onClick={handleSave} disabled={saving || !form.title} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534] disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>

      <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "content" && (
        <div className="bg-white rounded-[10px] p-4 space-y-4">
          <div><label className={labelClass}>Title</label><input value={form.title} onChange={(e) => updateField("title", e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>Description</label><textarea value={form.description} onChange={(e) => updateField("description", e.target.value)} rows={3} className={inputClass} /></div>
          <div><label className={labelClass}>Tool Component</label><select value={form.toolComponent} onChange={(e) => updateField("toolComponent", e.target.value)} className={inputClass}>{TOOL_COMPONENTS.map((tc) => <option key={tc.value} value={tc.value}>{tc.label}</option>)}</select></div>
          <div><label className={labelClass}>Additional Body Content (HTML)</label><textarea value={form.body} onChange={(e) => updateField("body", e.target.value)} rows={6} className={inputClass} /></div>
        </div>
      )}

      {activeTab === "seo" && (
        <div className="space-y-4">
          <div className="bg-white rounded-[10px] p-4 space-y-2">
            <label className={labelClass}>Slug</label>
            <input value={form.slug} onChange={(e) => updateField("slug", e.target.value)} className={inputClass} />
            <p className="text-[11px] text-[#a1a1aa]">URL: /tools/{form.slug}</p>
          </div>
          <div className="bg-white rounded-[10px] p-4 space-y-3">
            <h3 className="text-[13px] font-bold text-black">SEO</h3>
            <div><div className="flex justify-between"><label className={labelClass}>Meta Title</label><span className="text-[11px] text-[#a1a1aa]">{form.metaTitle.length}/60</span></div><input value={form.metaTitle} onChange={(e) => updateField("metaTitle", e.target.value)} className={inputClass} /></div>
            <div><div className="flex justify-between"><label className={labelClass}>Meta Description</label><span className="text-[11px] text-[#a1a1aa]">{form.metaDescription.length}/160</span></div><textarea value={form.metaDescription} onChange={(e) => updateField("metaDescription", e.target.value)} rows={3} className={inputClass} /></div>
          </div>
          <div className="bg-white rounded-[10px] p-4 space-y-3">
            <h3 className="text-[13px] font-bold text-black">Publish</h3>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.published} onChange={(e) => updateField("published", e.target.checked)} className="rounded" /><span className="text-[13px] text-black">Published</span></label>
          </div>
        </div>
      )}
    </div>
  );
}
