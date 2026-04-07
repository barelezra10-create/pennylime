"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createComparisonPage, updateComparisonPage, deleteComparisonPage } from "@/actions/content";
import { slugify } from "@/lib/content-helpers";
import { TabBar } from "@/components/admin/tab-bar";

interface FaqEntry { question: string; answer: string; }
interface ComparisonRow { feature: string; entityAValue: string; entityBValue: string; }

interface ComparisonFormData {
  id?: string;
  title: string;
  slug: string;
  entityA: string;
  entityB: string;
  introHtml: string;
  comparisonGrid: ComparisonRow[];
  verdict: string;
  faqEntries: FaqEntry[];
  metaTitle: string;
  metaDescription: string;
  published: boolean;
}

const TABS = [
  { id: "content", label: "Content" },
  { id: "grid", label: "Grid" },
  { id: "faq", label: "FAQ & SEO" },
];

export function ComparisonEditorClient({ comparison }: { comparison?: ComparisonFormData }) {
  const router = useRouter();
  const isEdit = !!comparison?.id;
  const [activeTab, setActiveTab] = useState("content");
  const [form, setForm] = useState<ComparisonFormData>(
    comparison || {
      title: "", slug: "", entityA: "", entityB: "", introHtml: "",
      comparisonGrid: [{ feature: "", entityAValue: "", entityBValue: "" }],
      verdict: "", faqEntries: [{ question: "", answer: "" }],
      metaTitle: "", metaDescription: "", published: false,
    }
  );
  const [saving, setSaving] = useState(false);

  function updateField(field: string, value: unknown) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "title" && !isEdit) next.slug = slugify(value as string);
      return next;
    });
  }

  function updateGridRow(index: number, field: keyof ComparisonRow, value: string) {
    const grid = [...form.comparisonGrid];
    grid[index] = { ...grid[index], [field]: value };
    setForm((prev) => ({ ...prev, comparisonGrid: grid }));
  }

  function updateFaq(index: number, field: "question" | "answer", value: string) {
    const faqs = [...form.faqEntries];
    faqs[index] = { ...faqs[index], [field]: value };
    setForm((prev) => ({ ...prev, faqEntries: faqs }));
  }

  async function handleSave() {
    setSaving(true);
    const data = {
      ...form,
      comparisonGrid: JSON.stringify(form.comparisonGrid.filter((r) => r.feature)),
      faqEntries: JSON.stringify(form.faqEntries.filter((f) => f.question && f.answer)),
    };
    const { id, ...rest } = data;
    if (isEdit && comparison?.id) { await updateComparisonPage(comparison.id, rest); }
    else { await createComparisonPage(rest); }
    router.push("/admin/content/comparisons");
    router.refresh();
    setSaving(false);
  }

  async function handleDelete() {
    if (!comparison?.id || !confirm("Delete?")) return;
    await deleteComparisonPage(comparison.id);
    router.push("/admin/content/comparisons");
    router.refresh();
  }

  const inputClass = "w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg bg-white";
  const labelClass = "text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-1 block";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black">{isEdit ? `Edit: ${form.title}` : "New Comparison"}</h1>
        <div className="flex gap-2">
          {isEdit && <button onClick={handleDelete} className="text-[13px] font-medium text-red-500 px-4 py-2 rounded-lg hover:bg-red-50">Delete</button>}
          <button onClick={handleSave} disabled={saving || !form.title} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534] disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>

      <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "content" && (
        <div className="bg-white rounded-[10px] p-4 space-y-4">
          <div><label className={labelClass}>Title</label><input value={form.title} onChange={(e) => updateField("title", e.target.value)} className={inputClass} placeholder="PennyLime vs Fundo" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Entity A</label><input value={form.entityA} onChange={(e) => updateField("entityA", e.target.value)} className={inputClass} placeholder="PennyLime" /></div>
            <div><label className={labelClass}>Entity B</label><input value={form.entityB} onChange={(e) => updateField("entityB", e.target.value)} className={inputClass} placeholder="Fundo" /></div>
          </div>
          <div><label className={labelClass}>Introduction</label><textarea value={form.introHtml} onChange={(e) => updateField("introHtml", e.target.value)} rows={4} className={inputClass} /></div>
          <div><label className={labelClass}>Verdict</label><textarea value={form.verdict} onChange={(e) => updateField("verdict", e.target.value)} rows={4} className={inputClass} /></div>
        </div>
      )}

      {activeTab === "grid" && (
        <div className="bg-white rounded-[10px] p-4">
          <div className="flex items-center justify-between mb-3">
            <label className={labelClass}>Comparison Grid</label>
            <button type="button" onClick={() => setForm((p) => ({ ...p, comparisonGrid: [...p.comparisonGrid, { feature: "", entityAValue: "", entityBValue: "" }] }))} className="text-[12px] text-[#15803d] hover:underline">+ Add Row</button>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_1fr_24px] gap-2 text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa]">
              <span>Feature</span><span>{form.entityA || "A"}</span><span>{form.entityB || "B"}</span><span></span>
            </div>
            {form.comparisonGrid.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_24px] gap-2">
                <input value={row.feature} onChange={(e) => updateGridRow(i, "feature", e.target.value)} className={inputClass} placeholder="Feature" />
                <input value={row.entityAValue} onChange={(e) => updateGridRow(i, "entityAValue", e.target.value)} className={inputClass} />
                <input value={row.entityBValue} onChange={(e) => updateGridRow(i, "entityBValue", e.target.value)} className={inputClass} />
                {form.comparisonGrid.length > 1 && <button type="button" onClick={() => setForm((p) => ({ ...p, comparisonGrid: p.comparisonGrid.filter((_, j) => j !== i) }))} className="text-red-400 hover:text-red-600">×</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "faq" && (
        <div className="space-y-4">
          {/* FAQ */}
          <div className="bg-white rounded-[10px] p-4">
            <div className="flex items-center justify-between mb-3">
              <label className={labelClass}>FAQ</label>
              <button type="button" onClick={() => setForm((p) => ({ ...p, faqEntries: [...p.faqEntries, { question: "", answer: "" }] }))} className="text-[12px] text-[#15803d] hover:underline">+ Add FAQ</button>
            </div>
            <div className="space-y-3">
              {form.faqEntries.map((faq, i) => (
                <div key={i} className="border border-[#e4e4e7] rounded-lg p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[11px] text-[#a1a1aa]">Q{i + 1}</span>
                    {form.faqEntries.length > 1 && <button type="button" onClick={() => setForm((p) => ({ ...p, faqEntries: p.faqEntries.filter((_, j) => j !== i) }))} className="text-[11px] text-red-400 hover:text-red-600">Remove</button>}
                  </div>
                  <input value={faq.question} onChange={(e) => updateFaq(i, "question", e.target.value)} placeholder="Question" className={inputClass} />
                  <textarea value={faq.answer} onChange={(e) => updateFaq(i, "answer", e.target.value)} placeholder="Answer" rows={2} className={inputClass} />
                </div>
              ))}
            </div>
          </div>

          {/* SEO */}
          <div className="bg-white rounded-[10px] p-4 space-y-2">
            <label className={labelClass}>Slug</label>
            <input value={form.slug} onChange={(e) => updateField("slug", e.target.value)} className={inputClass} />
            <p className="text-[11px] text-[#a1a1aa]">URL: /compare/{form.slug}</p>
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
