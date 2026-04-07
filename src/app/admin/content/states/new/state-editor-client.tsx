"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStatePage, updateStatePage, deleteStatePage } from "@/actions/content";
import { slugify } from "@/lib/content-helpers";
import { TabBar } from "@/components/admin/tab-bar";

interface FaqEntry { question: string; answer: string; }
interface LocalStat { label: string; value: string; }

interface StateFormData {
  id?: string;
  stateName: string;
  stateCode: string;
  slug: string;
  heroHeadline: string;
  heroSubtext: string;
  regulationsSummary: string;
  loanAvailability: string;
  localStats: LocalStat[];
  faqEntries: FaqEntry[];
  ctaText: string;
  metaTitle: string;
  metaDescription: string;
  published: boolean;
}

const TABS = [
  { id: "content", label: "Content" },
  { id: "stats", label: "Stats & FAQ" },
  { id: "seo", label: "SEO & Publish" },
];

export function StateEditorClient({ state }: { state?: StateFormData }) {
  const router = useRouter();
  const isEdit = !!state?.id;
  const [activeTab, setActiveTab] = useState("content");
  const [form, setForm] = useState<StateFormData>(
    state || {
      stateName: "", stateCode: "", slug: "", heroHeadline: "", heroSubtext: "",
      regulationsSummary: "", loanAvailability: "",
      localStats: [{ label: "", value: "" }],
      faqEntries: [{ question: "", answer: "" }],
      ctaText: "Apply Now", metaTitle: "", metaDescription: "", published: false,
    }
  );
  const [saving, setSaving] = useState(false);

  function updateField(field: string, value: unknown) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "stateName" && !isEdit) next.slug = slugify(value as string);
      return next;
    });
  }

  function updateFaq(index: number, field: "question" | "answer", value: string) {
    const faqs = [...form.faqEntries];
    faqs[index] = { ...faqs[index], [field]: value };
    setForm((prev) => ({ ...prev, faqEntries: faqs }));
  }

  function updateStat(index: number, field: "label" | "value", value: string) {
    const stats = [...form.localStats];
    stats[index] = { ...stats[index], [field]: value };
    setForm((prev) => ({ ...prev, localStats: stats }));
  }

  async function handleSave() {
    setSaving(true);
    const data = {
      ...form,
      faqEntries: JSON.stringify(form.faqEntries.filter((f) => f.question && f.answer)),
      localStats: JSON.stringify(form.localStats.filter((s) => s.label && s.value)),
    };
    const { id, ...rest } = data;
    if (isEdit && state?.id) {
      await updateStatePage(state.id, rest);
    } else {
      await createStatePage(rest);
    }
    router.push("/admin/content/states");
    router.refresh();
    setSaving(false);
  }

  async function handleDelete() {
    if (!state?.id || !confirm("Delete this state page?")) return;
    await deleteStatePage(state.id);
    router.push("/admin/content/states");
    router.refresh();
  }

  const inputClass = "w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg bg-white";
  const labelClass = "text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-1 block";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black">
          {isEdit ? `Edit: ${form.stateName}` : "New State Page"}
        </h1>
        <div className="flex gap-2">
          {isEdit && <button onClick={handleDelete} className="text-[13px] font-medium text-red-500 px-4 py-2 rounded-lg hover:bg-red-50">Delete</button>}
          <button onClick={handleSave} disabled={saving || !form.stateName} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534] disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "content" && (
        <div className="bg-white rounded-[10px] p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>State Name</label><input value={form.stateName} onChange={(e) => updateField("stateName", e.target.value)} className={inputClass} placeholder="California" /></div>
            <div><label className={labelClass}>State Code</label><input value={form.stateCode} onChange={(e) => updateField("stateCode", e.target.value.toUpperCase())} className={inputClass} placeholder="CA" maxLength={2} /></div>
          </div>
          <div><label className={labelClass}>Hero Headline</label><input value={form.heroHeadline} onChange={(e) => updateField("heroHeadline", e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>Hero Subtext</label><textarea value={form.heroSubtext} onChange={(e) => updateField("heroSubtext", e.target.value)} rows={2} className={inputClass} /></div>
          <div><label className={labelClass}>Regulations Summary</label><textarea value={form.regulationsSummary} onChange={(e) => updateField("regulationsSummary", e.target.value)} rows={4} className={inputClass} /></div>
          <div><label className={labelClass}>Loan Availability</label><textarea value={form.loanAvailability} onChange={(e) => updateField("loanAvailability", e.target.value)} rows={3} className={inputClass} /></div>
          <div><label className={labelClass}>CTA Text</label><input value={form.ctaText} onChange={(e) => updateField("ctaText", e.target.value)} className={inputClass} /></div>
        </div>
      )}

      {activeTab === "stats" && (
        <div className="space-y-4">
          {/* Local Stats */}
          <div className="bg-white rounded-[10px] p-4">
            <div className="flex items-center justify-between mb-3">
              <label className={labelClass}>Local Stats</label>
              <button type="button" onClick={() => setForm((p) => ({ ...p, localStats: [...p.localStats, { label: "", value: "" }] }))} className="text-[12px] text-[#15803d] hover:underline">+ Add Stat</button>
            </div>
            <div className="space-y-2">
              {form.localStats.map((stat, i) => (
                <div key={i} className="flex gap-2">
                  <input value={stat.label} onChange={(e) => updateStat(i, "label", e.target.value)} placeholder="Label" className={inputClass} />
                  <input value={stat.value} onChange={(e) => updateStat(i, "value", e.target.value)} placeholder="Value" className={inputClass} />
                  {form.localStats.length > 1 && <button type="button" onClick={() => setForm((p) => ({ ...p, localStats: p.localStats.filter((_, j) => j !== i) }))} className="text-red-400 hover:text-red-600 text-[14px]">×</button>}
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className="bg-white rounded-[10px] p-4">
            <div className="flex items-center justify-between mb-3">
              <label className={labelClass}>FAQ Entries</label>
              <button type="button" onClick={() => setForm((p) => ({ ...p, faqEntries: [...p.faqEntries, { question: "", answer: "" }] }))} className="text-[12px] text-[#15803d] hover:underline">+ Add FAQ</button>
            </div>
            <div className="space-y-3">
              {form.faqEntries.map((faq, i) => (
                <div key={i} className="border border-[#e4e4e7] rounded-lg p-3 space-y-2">
                  <div className="flex justify-between"><span className="text-[11px] text-[#a1a1aa]">Q{i + 1}</span>{form.faqEntries.length > 1 && <button type="button" onClick={() => setForm((p) => ({ ...p, faqEntries: p.faqEntries.filter((_, j) => j !== i) }))} className="text-[11px] text-red-400 hover:text-red-600">Remove</button>}</div>
                  <input value={faq.question} onChange={(e) => updateFaq(i, "question", e.target.value)} placeholder="Question" className={inputClass} />
                  <textarea value={faq.answer} onChange={(e) => updateFaq(i, "answer", e.target.value)} placeholder="Answer" rows={2} className={inputClass} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "seo" && (
        <div className="space-y-4">
          <div className="bg-white rounded-[10px] p-4 space-y-2">
            <label className={labelClass}>Slug</label>
            <input value={form.slug} onChange={(e) => updateField("slug", e.target.value)} className={inputClass} />
            <p className="text-[11px] text-[#a1a1aa]">URL: /states/{form.slug}</p>
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
