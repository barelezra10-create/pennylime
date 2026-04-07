"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createLandingPage, updateLandingPage, deleteLandingPage } from "@/actions/content";
import { TabBar } from "@/components/admin/tab-bar";

interface TrustStat { value: string; label: string; }
interface HowItWorksStep { num: string; title: string; desc: string; img: string; }
interface Testimonial { quote: string; name: string; role: string; amount: string; }
interface FaqEntry { question: string; answer: string; }

interface LPFormData {
  id?: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  phoneNumber: string;
  heroBadge: string;
  heroHeadlineLine1: string;
  heroHeadlineLine2: string;
  heroHeadlineLine3: string;
  heroSubtext: string;
  heroIllustration: string;
  trustItems: string[];
  trustStats: TrustStat[];
  howItWorksTitle: string;
  howItWorksSubtext: string;
  howItWorksSteps: HowItWorksStep[];
  testimonialsTitle: string;
  testimonials: Testimonial[];
  faqTitle: string;
  faqs: FaqEntry[];
  finalCtaHeadline: string;
  finalCtaSubtext: string;
  finalCtaButtonText: string;
  utmSource: string;
  utmCampaign: string;
  formTemplateSlug: string;
  formPlatforms: string[];
  defaultAmount: number;
  defaultTermWeeks: number;
  published: boolean;
}

const DEFAULT_FORM: LPFormData = {
  slug: "",
  metaTitle: "",
  metaDescription: "",
  phoneNumber: "",
  heroBadge: "",
  heroHeadlineLine1: "",
  heroHeadlineLine2: "",
  heroHeadlineLine3: "",
  heroSubtext: "",
  heroIllustration: "",
  trustItems: [""],
  trustStats: [{ value: "", label: "" }],
  howItWorksTitle: "Three steps. No paperwork.",
  howItWorksSubtext: "",
  howItWorksSteps: [{ num: "01", title: "", desc: "", img: "" }],
  testimonialsTitle: "Drivers we've funded.",
  testimonials: [{ quote: "", name: "", role: "", amount: "" }],
  faqTitle: "Common questions.",
  faqs: [{ question: "", answer: "" }],
  finalCtaHeadline: "Ready to get funded?",
  finalCtaSubtext: "",
  finalCtaButtonText: "Apply Now",
  utmSource: "lp",
  utmCampaign: "",
  formTemplateSlug: "",
  formPlatforms: ["Uber", "Lyft", "Both"],
  defaultAmount: 3000,
  defaultTermWeeks: 4,
  published: false,
};

function parseInitial(raw?: Record<string, unknown>): LPFormData {
  if (!raw) return DEFAULT_FORM;
  return {
    ...DEFAULT_FORM,
    ...(raw as Partial<LPFormData>),
    trustItems: (() => { try { return JSON.parse(raw.trustItems as string) as string[]; } catch { return [""]; } })(),
    trustStats: (() => { try { return JSON.parse(raw.trustStats as string) as TrustStat[]; } catch { return [{ value: "", label: "" }]; } })(),
    howItWorksSteps: (() => { try { return JSON.parse(raw.howItWorksSteps as string) as HowItWorksStep[]; } catch { return [{ num: "01", title: "", desc: "", img: "" }]; } })(),
    testimonials: (() => { try { return JSON.parse(raw.testimonials as string) as Testimonial[]; } catch { return [{ quote: "", name: "", role: "", amount: "" }]; } })(),
    faqs: (() => { try { return JSON.parse(raw.faqs as string) as FaqEntry[]; } catch { return [{ question: "", answer: "" }]; } })(),
    formPlatforms: (() => { try { return JSON.parse(raw.formPlatforms as string) as string[]; } catch { return ["Uber", "Lyft", "Both"]; } })(),
    phoneNumber: (raw.phoneNumber as string) ?? "",
    heroHeadlineLine2: (raw.heroHeadlineLine2 as string) ?? "",
    heroHeadlineLine3: (raw.heroHeadlineLine3 as string) ?? "",
    heroIllustration: (raw.heroIllustration as string) ?? "",
    howItWorksSubtext: (raw.howItWorksSubtext as string) ?? "",
    finalCtaSubtext: (raw.finalCtaSubtext as string) ?? "",
    defaultAmount: (raw.defaultAmount as number) ?? 3000,
    defaultTermWeeks: (raw.defaultTermWeeks as number) ?? 4,
    formTemplateSlug: (raw.formTemplateSlug as string) ?? "",
  };
}

const TABS = [
  { id: "hero", label: "Hero" },
  { id: "content", label: "Content" },
  { id: "form", label: "Form" },
  { id: "seo", label: "SEO" },
  { id: "publish", label: "Publish" },
];

export function LandingPageEditorClient({ page }: { page?: Record<string, unknown> }) {
  const router = useRouter();
  const isEdit = !!(page?.id);
  const [form, setForm] = useState<LPFormData>(parseInitial(page));
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("hero");

  function set(field: keyof LPFormData, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Trust items helpers
  function updateTrustItem(i: number, val: string) {
    const arr = [...form.trustItems]; arr[i] = val; set("trustItems", arr);
  }
  function addTrustItem() { set("trustItems", [...form.trustItems, ""]); }
  function removeTrustItem(i: number) { set("trustItems", form.trustItems.filter((_, idx) => idx !== i)); }

  // Trust stats helpers
  function updateTrustStat(i: number, field: keyof TrustStat, val: string) {
    const arr = [...form.trustStats]; arr[i] = { ...arr[i], [field]: val }; set("trustStats", arr);
  }
  function addTrustStat() { set("trustStats", [...form.trustStats, { value: "", label: "" }]); }
  function removeTrustStat(i: number) { set("trustStats", form.trustStats.filter((_, idx) => idx !== i)); }

  // Steps helpers
  function updateStep(i: number, field: keyof HowItWorksStep, val: string) {
    const arr = [...form.howItWorksSteps]; arr[i] = { ...arr[i], [field]: val }; set("howItWorksSteps", arr);
  }
  function addStep() { set("howItWorksSteps", [...form.howItWorksSteps, { num: String(form.howItWorksSteps.length + 1).padStart(2, "0"), title: "", desc: "", img: "" }]); }
  function removeStep(i: number) { set("howItWorksSteps", form.howItWorksSteps.filter((_, idx) => idx !== i)); }

  // Testimonials helpers
  function updateTestimonial(i: number, field: keyof Testimonial, val: string) {
    const arr = [...form.testimonials]; arr[i] = { ...arr[i], [field]: val }; set("testimonials", arr);
  }
  function addTestimonial() { set("testimonials", [...form.testimonials, { quote: "", name: "", role: "", amount: "" }]); }
  function removeTestimonial(i: number) { set("testimonials", form.testimonials.filter((_, idx) => idx !== i)); }

  // FAQ helpers
  function updateFaq(i: number, field: keyof FaqEntry, val: string) {
    const arr = [...form.faqs]; arr[i] = { ...arr[i], [field]: val }; set("faqs", arr);
  }
  function addFaq() { set("faqs", [...form.faqs, { question: "", answer: "" }]); }
  function removeFaq(i: number) { set("faqs", form.faqs.filter((_, idx) => idx !== i)); }

  // Form platforms helpers
  function updateFormPlatform(i: number, val: string) {
    const arr = [...form.formPlatforms]; arr[i] = val; set("formPlatforms", arr);
  }
  function addFormPlatform() { set("formPlatforms", [...form.formPlatforms, ""]); }
  function removeFormPlatform(i: number) { set("formPlatforms", form.formPlatforms.filter((_, idx) => idx !== i)); }

  async function handleSave() {
    setSaving(true);
    const payload = {
      ...form,
      trustItems: JSON.stringify(form.trustItems.filter(Boolean)),
      trustStats: JSON.stringify(form.trustStats.filter((s) => s.value || s.label)),
      howItWorksSteps: JSON.stringify(form.howItWorksSteps.filter((s) => s.title)),
      testimonials: JSON.stringify(form.testimonials.filter((t) => t.quote || t.name)),
      faqs: JSON.stringify(form.faqs.filter((f) => f.question && f.answer)),
      formPlatforms: JSON.stringify(form.formPlatforms.filter(Boolean)),
    };
    const { id, ...rest } = payload;
    void id;
    if (isEdit && page?.id) {
      await updateLandingPage(page.id as string, rest);
    } else {
      await createLandingPage(rest);
    }
    router.push("/admin/content/landing-pages");
    router.refresh();
    setSaving(false);
  }

  async function handleDelete() {
    if (!page?.id || !confirm("Delete this landing page?")) return;
    await deleteLandingPage(page.id as string);
    router.push("/admin/content/landing-pages");
    router.refresh();
  }

  const inputClass = "w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg bg-white";
  const labelClass = "text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-1 block";
  const sectionClass = "bg-white rounded-[10px] p-4 space-y-4";
  const sectionTitle = "text-[14px] font-bold text-black mb-3";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black">
          {isEdit ? `Edit: ${form.slug}` : "New Landing Page"}
        </h1>
        <div className="flex gap-2">
          {isEdit && (
            <button onClick={handleDelete} className="text-[13px] font-medium text-red-500 px-4 py-2 rounded-lg hover:bg-red-50">
              Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !form.slug}
            className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "hero" && (
        <div className="space-y-4">
          <div className={sectionClass}>
            <p className={sectionTitle}>Hero</p>
            <div>
              <label className={labelClass}>Badge Text</label>
              <input value={form.heroBadge} onChange={(e) => set("heroBadge", e.target.value)} className={inputClass} placeholder="Hey Uber & Lyft driver" />
            </div>
            <div>
              <label className={labelClass}>Headline Line 1</label>
              <input value={form.heroHeadlineLine1} onChange={(e) => set("heroHeadlineLine1", e.target.value)} className={inputClass} placeholder="Uber driver?" />
            </div>
            <div>
              <label className={labelClass}>Headline Line 2 (optional)</label>
              <input value={form.heroHeadlineLine2} onChange={(e) => set("heroHeadlineLine2", e.target.value)} className={inputClass} placeholder="Lyft driver?" />
            </div>
            <div>
              <label className={labelClass}>Headline Line 3, shown in green (optional)</label>
              <input value={form.heroHeadlineLine3} onChange={(e) => set("heroHeadlineLine3", e.target.value)} className={inputClass} placeholder="We got you." />
            </div>
            <div>
              <label className={labelClass}>Hero Subtext</label>
              <textarea value={form.heroSubtext} onChange={(e) => set("heroSubtext", e.target.value)} rows={3} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Illustration Path (optional)</label>
              <input value={form.heroIllustration} onChange={(e) => set("heroIllustration", e.target.value)} className={inputClass} placeholder="/illustrations/platform-rideshare.png" />
            </div>
          </div>
        </div>
      )}

      {activeTab === "content" && (
        <div className="space-y-4">
          {/* Trust Items */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <p className={sectionTitle}>Trust Row Items</p>
              <button type="button" onClick={addTrustItem} className="text-[12px] text-[#15803d] hover:underline">+ Add Item</button>
            </div>
            <div className="space-y-2">
              {form.trustItems.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <input value={item} onChange={(e) => updateTrustItem(i, e.target.value)} className={inputClass} placeholder="No credit check" />
                  {form.trustItems.length > 1 && (
                    <button type="button" onClick={() => removeTrustItem(i)} className="text-[11px] text-red-400 hover:text-red-600 px-2">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Trust Stats */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between">
              <p className={sectionTitle}>Trust Stats</p>
              <button type="button" onClick={addTrustStat} className="text-[12px] text-[#15803d] hover:underline">+ Add Stat</button>
            </div>
            <div className="space-y-2">
              {form.trustStats.map((stat, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input value={stat.value} onChange={(e) => updateTrustStat(i, "value", e.target.value)} className={inputClass} placeholder="$2M+" />
                  <input value={stat.label} onChange={(e) => updateTrustStat(i, "label", e.target.value)} className={inputClass} placeholder="Funded to rideshare drivers" />
                  {form.trustStats.length > 1 && (
                    <button type="button" onClick={() => removeTrustStat(i)} className="text-[11px] text-red-400 hover:text-red-600 px-2">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* How It Works */}
          <div className={sectionClass}>
            <p className={sectionTitle}>How It Works</p>
            <div>
              <label className={labelClass}>Section Title</label>
              <input value={form.howItWorksTitle} onChange={(e) => set("howItWorksTitle", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Section Subtext (optional)</label>
              <textarea value={form.howItWorksSubtext} onChange={(e) => set("howItWorksSubtext", e.target.value)} rows={2} className={inputClass} />
            </div>
            <div className="flex items-center justify-between">
              <label className={labelClass}>Steps</label>
              <button type="button" onClick={addStep} className="text-[12px] text-[#15803d] hover:underline">+ Add Step</button>
            </div>
            <div className="space-y-3">
              {form.howItWorksSteps.map((step, i) => (
                <div key={i} className="border border-[#e4e4e7] rounded-lg p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[11px] text-[#a1a1aa]">Step {i + 1}</span>
                    {form.howItWorksSteps.length > 1 && (
                      <button type="button" onClick={() => removeStep(i)} className="text-[11px] text-red-400 hover:text-red-600">Remove</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={step.num} onChange={(e) => updateStep(i, "num", e.target.value)} className={inputClass} placeholder="01" />
                    <input value={step.img} onChange={(e) => updateStep(i, "img", e.target.value)} className={inputClass} placeholder="/illustrations/step-1.png" />
                  </div>
                  <input value={step.title} onChange={(e) => updateStep(i, "title", e.target.value)} className={inputClass} placeholder="Step title" />
                  <textarea value={step.desc} onChange={(e) => updateStep(i, "desc", e.target.value)} rows={2} className={inputClass} placeholder="Step description" />
                </div>
              ))}
            </div>
          </div>

          {/* Testimonials */}
          <div className={sectionClass}>
            <p className={sectionTitle}>Testimonials</p>
            <div>
              <label className={labelClass}>Section Title</label>
              <input value={form.testimonialsTitle} onChange={(e) => set("testimonialsTitle", e.target.value)} className={inputClass} />
            </div>
            <div className="flex items-center justify-between">
              <label className={labelClass}>Testimonials</label>
              <button type="button" onClick={addTestimonial} className="text-[12px] text-[#15803d] hover:underline">+ Add</button>
            </div>
            <div className="space-y-3">
              {form.testimonials.map((t, i) => (
                <div key={i} className="border border-[#e4e4e7] rounded-lg p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[11px] text-[#a1a1aa]">#{i + 1}</span>
                    {form.testimonials.length > 1 && (
                      <button type="button" onClick={() => removeTestimonial(i)} className="text-[11px] text-red-400 hover:text-red-600">Remove</button>
                    )}
                  </div>
                  <textarea value={t.quote} onChange={(e) => updateTestimonial(i, "quote", e.target.value)} rows={2} className={inputClass} placeholder="Quote text" />
                  <div className="grid grid-cols-3 gap-2">
                    <input value={t.name} onChange={(e) => updateTestimonial(i, "name", e.target.value)} className={inputClass} placeholder="Marcus T." />
                    <input value={t.role} onChange={(e) => updateTestimonial(i, "role", e.target.value)} className={inputClass} placeholder="Uber Driver · Atlanta, GA" />
                    <input value={t.amount} onChange={(e) => updateTestimonial(i, "amount", e.target.value)} className={inputClass} placeholder="$4,200" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div className={sectionClass}>
            <p className={sectionTitle}>FAQ</p>
            <div>
              <label className={labelClass}>Section Title</label>
              <input value={form.faqTitle} onChange={(e) => set("faqTitle", e.target.value)} className={inputClass} />
            </div>
            <div className="flex items-center justify-between">
              <label className={labelClass}>Questions</label>
              <button type="button" onClick={addFaq} className="text-[12px] text-[#15803d] hover:underline">+ Add FAQ</button>
            </div>
            <div className="space-y-3">
              {form.faqs.map((faq, i) => (
                <div key={i} className="border border-[#e4e4e7] rounded-lg p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[11px] text-[#a1a1aa]">Q{i + 1}</span>
                    {form.faqs.length > 1 && (
                      <button type="button" onClick={() => removeFaq(i)} className="text-[11px] text-red-400 hover:text-red-600">Remove</button>
                    )}
                  </div>
                  <input value={faq.question} onChange={(e) => updateFaq(i, "question", e.target.value)} className={inputClass} placeholder="Question" />
                  <textarea value={faq.answer} onChange={(e) => updateFaq(i, "answer", e.target.value)} rows={2} className={inputClass} placeholder="Answer" />
                </div>
              ))}
            </div>
          </div>

          {/* Final CTA */}
          <div className={sectionClass}>
            <p className={sectionTitle}>Final CTA</p>
            <div>
              <label className={labelClass}>Headline</label>
              <input value={form.finalCtaHeadline} onChange={(e) => set("finalCtaHeadline", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Subtext (optional)</label>
              <textarea value={form.finalCtaSubtext} onChange={(e) => set("finalCtaSubtext", e.target.value)} rows={2} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Button Text</label>
              <input value={form.finalCtaButtonText} onChange={(e) => set("finalCtaButtonText", e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>
      )}

      {activeTab === "form" && (
        <div className={sectionClass}>
          <p className={sectionTitle}>Form Config</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>UTM Source</label>
              <input value={form.utmSource} onChange={(e) => set("utmSource", e.target.value)} className={inputClass} placeholder="lp" />
            </div>
            <div>
              <label className={labelClass}>UTM Campaign</label>
              <input value={form.utmCampaign} onChange={(e) => set("utmCampaign", e.target.value)} className={inputClass} placeholder="uber-lyft" />
            </div>
            <div>
              <label className={labelClass}>Default Amount ($)</label>
              <input type="number" value={form.defaultAmount} onChange={(e) => set("defaultAmount", Number(e.target.value))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Default Term (weeks)</label>
              <input type="number" value={form.defaultTermWeeks} onChange={(e) => set("defaultTermWeeks", Number(e.target.value))} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Form Template Slug (optional)</label>
            <input
              value={form.formTemplateSlug}
              onChange={(e) => set("formTemplateSlug", e.target.value)}
              className={inputClass}
              placeholder="e.g. uber-lyft-short (leave empty for default)"
            />
            <p className="text-[11px] text-[#a1a1aa] mt-1">Links to a form template. Applicants will use this form variant.</p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className={labelClass}>Platform Options</label>
              <button type="button" onClick={addFormPlatform} className="text-[12px] text-[#15803d] hover:underline">+ Add</button>
            </div>
            <div className="space-y-2 mt-1">
              {form.formPlatforms.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input value={p} onChange={(e) => updateFormPlatform(i, e.target.value)} className={inputClass} placeholder="Uber" />
                  {form.formPlatforms.length > 1 && (
                    <button type="button" onClick={() => removeFormPlatform(i)} className="text-[11px] text-red-400 hover:text-red-600 px-2">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "seo" && (
        <div className={sectionClass}>
          <p className={sectionTitle}>SEO</p>
          <div>
            <div className="flex justify-between">
              <label className={labelClass}>Meta Title</label>
              <span className="text-[11px] text-[#a1a1aa]">{form.metaTitle.length}/60</span>
            </div>
            <input value={form.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} className={inputClass} />
          </div>
          <div>
            <div className="flex justify-between">
              <label className={labelClass}>Meta Description</label>
              <span className="text-[11px] text-[#a1a1aa]">{form.metaDescription.length}/160</span>
            </div>
            <textarea value={form.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} rows={3} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Phone Number (header)</label>
            <input value={form.phoneNumber} onChange={(e) => set("phoneNumber", e.target.value)} className={inputClass} placeholder="1-800-555-1234" />
          </div>
          <div>
            <label className={labelClass}>Slug</label>
            <input value={form.slug} onChange={(e) => set("slug", e.target.value)} className={inputClass} placeholder="uber-lyft-driver-loans" />
            <p className="text-[11px] text-[#a1a1aa] mt-1">URL: /lp/{form.slug || "..."}</p>
          </div>
        </div>
      )}

      {activeTab === "publish" && (
        <div className="bg-white rounded-[10px] p-4 space-y-3">
          <h3 className="text-[13px] font-bold text-black">Publish</h3>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => set("published", e.target.checked)}
              className="rounded"
            />
            <span className="text-[13px] text-black">Published</span>
          </label>
          {form.slug && (
            <a
              href={`/lp/${form.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[11px] text-[#15803d] hover:underline truncate"
            >
              /lp/{form.slug} ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
