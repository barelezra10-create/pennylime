"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { TiptapEditor } from "@/components/content/tiptap-editor";
import { createEmailSequence, updateEmailSequence } from "@/actions/email";
import type { SequenceStep } from "@/types/email";

const TRIGGER_TYPES = [
  { value: "abandoned_app", label: "Abandoned Application" },
  { value: "stage_change", label: "Stage Change" },
  { value: "manual", label: "Manual" },
];

function newStep(order: number): SequenceStep {
  return { id: crypto.randomUUID(), order, subject: "", body: "", delayAmount: 1, delayUnit: "days" };
}

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerValue: string | null;
  active: boolean;
  steps: string;
}

interface Props {
  sequence?: Sequence;
}

export function SequenceEditorClient({ sequence }: Props) {
  const router = useRouter();
  const [name, setName] = useState(sequence?.name ?? "");
  const [description, setDescription] = useState(sequence?.description ?? "");
  const [triggerType, setTriggerType] = useState(sequence?.triggerType ?? "abandoned_app");
  const [triggerValue, setTriggerValue] = useState(sequence?.triggerValue ?? "");
  const [active, setActive] = useState(sequence?.active ?? false);
  const [steps, setSteps] = useState<SequenceStep[]>(() => {
    if (sequence?.steps) {
      try { return JSON.parse(sequence.steps); } catch { return [newStep(1)]; }
    }
    return [newStep(1)];
  });
  const [saving, setSaving] = useState(false);

  function addStep() {
    setSteps((prev) => [...prev, newStep(prev.length + 1)]);
  }

  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
  }

  function moveStep(idx: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, i) => ({ ...s, order: i + 1 }));
    });
  }

  function updateStep(idx: number, key: keyof SequenceStep, value: string | number) {
    setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, [key]: value } : s));
  }

  async function save() {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const payload = { name, description, triggerType, triggerValue, active, steps: JSON.stringify(steps) };
      if (sequence?.id) {
        await updateEmailSequence(sequence.id, payload);
        toast.success("Sequence updated");
      } else {
        await createEmailSequence(payload);
        toast.success("Sequence created");
      }
      router.push("/admin/email/sequences");
    } catch {
      toast.error("Failed to save sequence");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={sequence ? "Edit Sequence" : "New Sequence"}
        description="Build an automated email drip sequence"
      />

      <div className="grid grid-cols-[1fr_280px] gap-6">
        {/* Main */}
        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-2">Sequence Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Abandoned App Re-engagement"
              className="w-full bg-[#f4f4f5] rounded-xl px-4 py-3 text-[14px] text-black placeholder:text-[#a1a1aa] focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-2">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full bg-[#f4f4f5] rounded-xl px-4 py-3 text-[14px] text-black placeholder:text-[#a1a1aa] focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
            />
          </div>

          {/* Trigger */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-2">Trigger Type</label>
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value)}
                className="w-full bg-[#f4f4f5] rounded-xl px-4 py-3 text-[14px] text-black focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
              >
                {TRIGGER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {triggerType === "stage_change" && (
              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#71717a] mb-2">Trigger Value (stage)</label>
                <input
                  value={triggerValue}
                  onChange={(e) => setTriggerValue(e.target.value)}
                  placeholder="e.g. QUALIFIED"
                  className="w-full bg-[#f4f4f5] rounded-xl px-4 py-3 text-[14px] text-black placeholder:text-[#a1a1aa] focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
                />
              </div>
            )}
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-[12px] font-semibold uppercase tracking-[0.05em] text-[#71717a]">Steps</label>
              <button type="button" onClick={addStep} className="text-[12px] font-medium text-[#15803d] hover:underline">
                + Add Step
              </button>
            </div>
            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div key={step.id} className="bg-white border border-[#e4e4e7] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] font-bold text-[#a1a1aa] uppercase tracking-[0.06em]">Step {step.order}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => moveStep(idx, -1)} disabled={idx === 0} className="p-1 rounded text-[#a1a1aa] hover:text-black disabled:opacity-30 transition-colors">
                        ↑
                      </button>
                      <button type="button" onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1} className="p-1 rounded text-[#a1a1aa] hover:text-black disabled:opacity-30 transition-colors">
                        ↓
                      </button>
                      <button type="button" onClick={() => removeStep(idx)} className="p-1 rounded text-[#a1a1aa] hover:text-red-500 transition-colors ml-1">
                        &times;
                      </button>
                    </div>
                  </div>

                  {/* Delay */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[12px] text-[#71717a]">Send after</span>
                    <input
                      type="number"
                      min={1}
                      value={step.delayAmount}
                      onChange={(e) => updateStep(idx, "delayAmount", parseInt(e.target.value) || 1)}
                      className="w-16 bg-[#f4f4f5] rounded-lg px-2 py-1.5 text-[13px] text-center focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
                    />
                    <select
                      value={step.delayUnit}
                      onChange={(e) => updateStep(idx, "delayUnit", e.target.value)}
                      className="bg-[#f4f4f5] rounded-lg px-2 py-1.5 text-[13px] text-black focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
                    >
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </select>
                  </div>

                  {/* Subject */}
                  <input
                    value={step.subject}
                    onChange={(e) => updateStep(idx, "subject", e.target.value)}
                    placeholder="Email subject"
                    className="w-full bg-[#f4f4f5] rounded-lg px-3 py-2 text-[13px] text-black placeholder:text-[#a1a1aa] mb-3 focus:outline-none focus:ring-2 focus:ring-[#15803d]/30"
                  />

                  {/* Body */}
                  <div className="border border-[#e4e4e7] rounded-lg overflow-hidden">
                    <TiptapEditor
                      content={step.body}
                      onChange={(html) => updateStep(idx, "body", html)}
                      placeholder="Email body..."
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white border border-[#e4e4e7] rounded-xl p-5">
            <h3 className="text-[13px] font-bold text-black mb-4">Settings</h3>

            {/* Active toggle */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-[13px] text-black font-medium">Active</span>
              <button
                type="button"
                onClick={() => setActive(!active)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${active ? "bg-[#15803d]" : "bg-[#d4d4d8]"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${active ? "translate-x-4.5" : "translate-x-0.5"}`} />
              </button>
            </div>

            <button
              onClick={save}
              disabled={saving}
              className="w-full bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Sequence"}
            </button>
          </div>

          <div className="bg-[#f4f4f5] rounded-xl p-4">
            <p className="text-[12px] text-[#71717a] font-medium mb-1">Total Steps</p>
            <p className="text-[24px] font-extrabold text-black">{steps.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
