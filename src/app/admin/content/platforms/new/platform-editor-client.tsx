"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPlatformPage, updatePlatformPage, deletePlatformPage } from "@/actions/content";
import { slugify } from "@/lib/content-helpers";
import { TabBar } from "@/components/admin/tab-bar";

interface FaqEntry {
  question: string;
  answer: string;
}

interface PlatformFormData {
  id?: string;
  platformName: string;
  slug: string;
  heroHeadline: string;
  heroSubtext: string;
  platformDescription: string;
  avgEarnings: string;
  topEarnerRange: string;
  loanDetailsHtml: string;
  faqEntries: FaqEntry[];
  ctaText: string;
  ctaSubtext: string;
  metaTitle: string;
  metaDescription: string;
  published: boolean;
}

const TABS = [
  { id: "content", label: "Content" },
  { id: "faq", label: "FAQ" },
  { id: "seo", label: "SEO & Publish" },
];

export function PlatformEditorClient({ platform }: { platform?: PlatformFormData }) {
  const router = useRouter();
  const isEdit = !!platform?.id;
  const [activeTab, setActiveTab] = useState("content");
  const [form, setForm] = useState<PlatformFormData>(
    platform || {
      platformName: "", slug: "", heroHeadline: "", heroSubtext: "",
      platformDescription: "", avgEarnings: "", topEarnerRange: "",
      loanDetailsHtml: "", faqEntries: [{ question: "", answer: "" }],
      ctaText: "Apply Now", ctaSubtext: "", metaTitle: "", metaDescription: "", published: false,
    }
  );
  const [saving, setSaving] = useState(false);

  function updateField(field: string, value: unknown) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "platformName" && !isEdit) next.slug = slugify(value as string + "-drivers");
      return next;
    });
  }

  function updateFaq(index: number, field: "question" | "answer", value: string) {
    const faqs = [...form.faqEntries];
    faqs[index] = { ...faqs[index], [field]: value };
    setForm((prev) => ({ ...prev, faqEntries: faqs }));
  }

  function addFaq() {
    setForm((prev) => ({ ...prev, faqEntries: [...prev.faqEntries, { question: "", answer: "" }] }));
  }

  function removeFaq(index: number) {
    setForm((prev) => ({ ...prev, faqEntries: prev.faqEntries.filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    setSaving(true);
    const data = {
      ...form,
      faqEntries: JSON.stringify(form.faqEntries.filter((f) => f.question && f.answer)),
    };
    const { id, ...rest } = data;
    if (isEdit && platform?.id) {
      await updatePlatformPage(platform.id, rest);
    } else {
      await createPlatformPage(rest);
    }
    router.push("/admin/content/platforms");
    router.refresh();
    setSaving(false);
  }

  async function handleDelete() {
    if (!platform?.id || !confirm("Delete this platform page?")) return;
    await deletePlatformPage(platform.id);
    router.push("/admin/content/platforms");
    router.refresh();
  }

  const inputClass = "w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg bg-white";
  const labelClass = "text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-1 block";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black">
          {isEdit ? `Edit: ${form.platformName}` : "New Platform Page"}
        </h1>
        <div className="flex gap-2">
          {isEdit && (
            <button onClick={handleDelete} className="text-[13px] font-medium text-red-500 px-4 py-2 rounded-lg hover:bg-red-50">Delete</button>
          )}
          <button onClick={handleSave} disabled={saving || !form.platformName} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534] disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "content" && (
        <div className="bg-white rounded-[10px] p-4 space-y-4">
          <div>
            <label className={labelClass}>Platform Name</label>
            <input value={form.platformName} onChange={(e) => updateField("platformName", e.target.value)} className={inputClass} placeholder="Uber" />
          </div>
          <div>
            <label className={labelClass}>Hero Headline</label>
            <input value={form.heroHeadline} onChange={(e) => updateField("heroHeadline", e.target.value)} className={inputClass} placeholder="Loans for Uber Drivers" />
          </div>
          <div>
            <label className={labelClass}>Hero Subtext</label>
            <textarea value={form.heroSubtext} onChange={(e) => updateField("heroSubtext", e.target.value)} rows={2} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Platform Description</label>
            <textarea value={form.platformDescription} onChange={(e) => updateField("platformDescription", e.target.value)} rows={4} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Avg Earnings</label>
              <input value={form.avgEarnings} onChange={(e) => updateField("avgEarnings", e.target.value)} className={inputClass} placeholder="$45,000/yr" />
            </div>
            <div>
              <label className={labelClass}>Top Earner Range</label>
              <input value={form.topEarnerRange} onChange={(e) => updateField("topEarnerRange", e.target.value)} className={inputClass} placeholder="$80,000-$120,000/yr" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Loan Details</label>
            <textarea value={form.loanDetailsHtml} onChange={(e) => updateField("loanDetailsHtml", e.target.value)} rows={4} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>CTA Text</label>
            <input value={form.ctaText} onChange={(e) => updateField("ctaText", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>CTA Subtext</label>
            <input value={form.ctaSubtext} onChange={(e) => updateField("ctaSubtext", e.target.value)} className={inputClass} />
          </div>
        </div>
      )}

      {activeTab === "faq" && (
        <div className="bg-white rounded-[10px] p-4">
          <div className="flex items-center justify-between mb-3">
            <label className={labelClass}>FAQ Entries</label>
            <button type="button" onClick={addFaq} className="text-[12px] text-[#15803d] hover:underline">+ Add FAQ</button>
          </div>
          <div className="space-y-3">
            {form.faqEntries.map((faq, i) => (
              <div key={i} className="border border-[#e4e4e7] rounded-lg p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-[11px] text-[#a1a1aa]">Q{i + 1}</span>
                  {form.faqEntries.length > 1 && (
                    <button type="button" onClick={() => removeFaq(i)} className="text-[11px] text-red-400 hover:text-red-600">Remove</button>
                  )}
                </div>
                <input value={faq.question} onChange={(e) => updateFaq(i, "question", e.target.value)} placeholder="Question" className={inputClass} />
                <textarea value={faq.answer} onChange={(e) => updateFaq(i, "answer", e.target.value)} placeholder="Answer" rows={2} className={inputClass} />
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "seo" && (
        <div className="space-y-4">
          <div className="bg-white rounded-[10px] p-4 space-y-2">
            <label className={labelClass}>Slug</label>
            <input value={form.slug} onChange={(e) => updateField("slug", e.target.value)} className={inputClass} />
            <p className="text-[11px] text-[#a1a1aa]">URL: /loans/{form.slug}</p>
          </div>
          <div className="bg-white rounded-[10px] p-4 space-y-3">
            <h3 className="text-[13px] font-bold text-black">SEO</h3>
            <div>
              <div className="flex justify-between"><label className={labelClass}>Meta Title</label><span className="text-[11px] text-[#a1a1aa]">{form.metaTitle.length}/60</span></div>
              <input value={form.metaTitle} onChange={(e) => updateField("metaTitle", e.target.value)} className={inputClass} />
            </div>
            <div>
              <div className="flex justify-between"><label className={labelClass}>Meta Description</label><span className="text-[11px] text-[#a1a1aa]">{form.metaDescription.length}/160</span></div>
              <textarea value={form.metaDescription} onChange={(e) => updateField("metaDescription", e.target.value)} rows={3} className={inputClass} />
            </div>
          </div>
          <div className="bg-white rounded-[10px] p-4 space-y-3">
            <h3 className="text-[13px] font-bold text-black">Publish</h3>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.published} onChange={(e) => updateField("published", e.target.checked)} className="rounded" />
              <span className="text-[13px] text-black">Published</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
