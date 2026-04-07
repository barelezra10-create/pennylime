"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import type { FormStep, FormField } from "@/types/form-template";
import { DEFAULT_STEPS } from "@/types/form-template";
import {
  createFormTemplate,
  updateFormTemplate,
  deleteFormTemplate,
} from "@/actions/form-templates";
import { slugify } from "@/lib/content-helpers";

interface TemplateData {
  id?: string;
  name: string;
  slug: string;
  description: string;
  steps: FormStep[];
  isDefault: boolean;
  published: boolean;
}

interface Props {
  template?: TemplateData;
}

const FIELD_TYPES = ["text", "number", "select", "file", "checkbox", "textarea"] as const;

export function FormTemplateEditorClient({ template }: Props) {
  const router = useRouter();
  const isEdit = !!template?.id;

  const [name, setName] = useState(template?.name ?? "");
  const [slug, setSlug] = useState(template?.slug ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [published, setPublished] = useState(template?.published ?? false);
  const [steps, setSteps] = useState<FormStep[]>(
    template?.steps && template.steps.length > 0
      ? template.steps
      : DEFAULT_STEPS.map((s) => ({ ...s }))
  );
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function handleNameChange(val: string) {
    setName(val);
    if (!isEdit) {
      setSlug(slugify(val));
    }
  }

  function updateStep(index: number, patch: Partial<FormStep>) {
    setSteps((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function moveStep(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      // Re-assign order
      return next.map((s, i) => ({ ...s, order: i }));
    });
    setSelectedStepIndex(target);
  }

  function addCustomStep() {
    const newStep: FormStep = {
      id: `custom-${Date.now()}`,
      title: "Custom Step",
      description: "",
      order: steps.length,
      enabled: true,
      type: "custom",
      customFields: [],
    };
    setSteps((prev) => [...prev, newStep]);
    setSelectedStepIndex(steps.length);
  }

  function addField(stepIndex: number) {
    const newField: FormField = {
      id: `field-${Date.now()}`,
      label: "New Field",
      type: "text",
      placeholder: "",
      required: false,
      order: steps[stepIndex].customFields?.length ?? 0,
    };
    updateStep(stepIndex, {
      customFields: [...(steps[stepIndex].customFields ?? []), newField],
    });
  }

  function updateField(stepIndex: number, fieldId: string, patch: Partial<FormField>) {
    const fields = steps[stepIndex].customFields ?? [];
    const updated = fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f));
    updateStep(stepIndex, { customFields: updated });
  }

  function removeField(stepIndex: number, fieldId: string) {
    const fields = (steps[stepIndex].customFields ?? []).filter((f) => f.id !== fieldId);
    updateStep(stepIndex, { customFields: fields.map((f, i) => ({ ...f, order: i })) });
  }

  function moveField(stepIndex: number, fieldIndex: number, dir: -1 | 1) {
    const fields = [...(steps[stepIndex].customFields ?? [])];
    const target = fieldIndex + dir;
    if (target < 0 || target >= fields.length) return;
    [fields[fieldIndex], fields[target]] = [fields[target], fields[fieldIndex]];
    updateStep(stepIndex, { customFields: fields.map((f, i) => ({ ...f, order: i })) });
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!slug.trim()) {
      toast.error("Slug is required");
      return;
    }
    setSaving(true);
    try {
      const stepsJson = JSON.stringify(steps);
      if (isEdit && template?.id) {
        await updateFormTemplate(template.id, {
          name,
          slug,
          description,
          steps: stepsJson,
          isDefault,
          published,
        });
        toast.success("Template saved");
      } else {
        const created = await createFormTemplate({
          name,
          slug,
          description,
          steps: stepsJson,
          isDefault,
          published,
        });
        toast.success("Template created");
        router.push(`/admin/content/form-templates/${created.id}`);
      }
    } catch (err) {
      toast.error("Failed to save template");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!template?.id) return;
    if (!confirm("Delete this template? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteFormTemplate(template.id);
      toast.success("Template deleted");
      router.push("/admin/content/form-templates");
    } catch (err) {
      toast.error("Failed to delete template");
      console.error(err);
    } finally {
      setDeleting(false);
    }
  }

  const selectedStep = selectedStepIndex !== null ? steps[selectedStepIndex] : null;

  const inputClass = "w-full text-[13px] px-3 py-2 bg-[#f4f4f5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#15803d]/20 border border-transparent focus:border-[#15803d]/30";
  const labelClass = "block text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] mb-1";

  return (
    <div>
      <PageHeader
        title={isEdit ? "Edit Form Template" : "New Form Template"}
        description="Configure application form steps and custom fields"
      />

      <div className="grid grid-cols-[250px_1fr_280px] gap-4 mt-2">
        {/* Left: Step list */}
        <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-[#f4f4f5]">
            <p className={labelClass.replace("mb-1", "mb-0")}>Steps</p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-[#f4f4f5]">
            {steps.map((step, i) => (
              <div
                key={step.id}
                onClick={() => setSelectedStepIndex(i)}
                className={`px-3 py-2.5 cursor-pointer transition-colors ${
                  selectedStepIndex === i ? "bg-[#f0f5f0]" : "hover:bg-[#f8f8f6]"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-black truncate">{step.title}</p>
                    <p className="text-[10px] text-[#a1a1aa]">
                      {step.type === "builtin" ? step.builtinKey : "Custom"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Enable toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateStep(i, { enabled: !step.enabled });
                      }}
                      className={`w-7 h-4 rounded-full transition-colors flex items-center ${
                        step.enabled ? "bg-[#15803d]" : "bg-[#d4d4d8]"
                      }`}
                      title={step.enabled ? "Disable step" : "Enable step"}
                    >
                      <span
                        className={`w-3 h-3 bg-white rounded-full shadow transition-transform mx-0.5 ${
                          step.enabled ? "translate-x-3" : "translate-x-0"
                        }`}
                      />
                    </button>
                    {/* Reorder */}
                    <div className="flex flex-col">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveStep(i, -1); }}
                        disabled={i === 0}
                        className="text-[#a1a1aa] hover:text-black disabled:opacity-20 leading-none text-[10px]"
                      >▲</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveStep(i, 1); }}
                        disabled={i === steps.length - 1}
                        className="text-[#a1a1aa] hover:text-black disabled:opacity-20 leading-none text-[10px]"
                      >▼</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-[#f4f4f5]">
            <button
              onClick={addCustomStep}
              className="w-full text-[12px] font-semibold text-[#15803d] bg-[#f0f5f0] hover:bg-[#e8f0e8] rounded-lg py-2 transition-colors"
            >
              + Add Custom Step
            </button>
          </div>
        </div>

        {/* Middle: Step detail editor */}
        <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-hidden">
          {selectedStep && selectedStepIndex !== null ? (
            <div className="p-5">
              <div className="flex items-center gap-3 mb-5">
                <div>
                  <h3 className="text-[14px] font-semibold text-black">
                    {selectedStep.type === "builtin" ? "Built-in Step" : "Custom Step"}
                  </h3>
                  <p className="text-[11px] text-[#a1a1aa]">
                    {selectedStep.type === "builtin"
                      ? `Key: ${selectedStep.builtinKey}, fields are hardcoded`
                      : "Fully configurable fields"}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Title</label>
                  <input
                    value={selectedStep.title}
                    onChange={(e) => updateStep(selectedStepIndex, { title: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <input
                    value={selectedStep.description}
                    onChange={(e) => updateStep(selectedStepIndex, { description: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateStep(selectedStepIndex, { enabled: !selectedStep.enabled })}
                    className={`w-9 h-5 rounded-full transition-colors flex items-center ${
                      selectedStep.enabled ? "bg-[#15803d]" : "bg-[#d4d4d8]"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${
                        selectedStep.enabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span className="text-[12px] text-[#71717a]">
                    {selectedStep.enabled ? "Step enabled" : "Step disabled"}
                  </span>
                </div>

                {/* Custom fields builder */}
                {selectedStep.type === "custom" && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <p className={labelClass.replace("mb-1", "mb-0")}>Fields</p>
                      <button
                        onClick={() => addField(selectedStepIndex)}
                        className="text-[11px] font-semibold text-[#15803d] hover:text-[#166534] transition-colors"
                      >
                        + Add Field
                      </button>
                    </div>
                    <div className="space-y-3">
                      {(selectedStep.customFields ?? []).map((field, fi) => (
                        <div key={field.id} className="bg-[#f8f8f8] rounded-xl p-3 border border-[#e4e4e7]">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex flex-col gap-0.5">
                              <button
                                onClick={() => moveField(selectedStepIndex, fi, -1)}
                                disabled={fi === 0}
                                className="text-[#a1a1aa] hover:text-black disabled:opacity-20 text-[10px] leading-none"
                              >▲</button>
                              <button
                                onClick={() => moveField(selectedStepIndex, fi, 1)}
                                disabled={fi === (selectedStep.customFields?.length ?? 0) - 1}
                                className="text-[#a1a1aa] hover:text-black disabled:opacity-20 text-[10px] leading-none"
                              >▼</button>
                            </div>
                            <div className="flex-1 grid grid-cols-2 gap-2">
                              <div>
                                <label className={labelClass}>Label</label>
                                <input
                                  value={field.label}
                                  onChange={(e) => updateField(selectedStepIndex, field.id, { label: e.target.value })}
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className={labelClass}>Type</label>
                                <select
                                  value={field.type}
                                  onChange={(e) => updateField(selectedStepIndex, field.id, { type: e.target.value as FormField["type"] })}
                                  className={inputClass}
                                >
                                  {FIELD_TYPES.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className={labelClass}>Placeholder</label>
                                <input
                                  value={field.placeholder ?? ""}
                                  onChange={(e) => updateField(selectedStepIndex, field.id, { placeholder: e.target.value })}
                                  className={inputClass}
                                />
                              </div>
                              <div className="flex items-end gap-2">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={field.required}
                                    onChange={(e) => updateField(selectedStepIndex, field.id, { required: e.target.checked })}
                                    className="accent-[#15803d]"
                                  />
                                  <span className="text-[11px] text-[#71717a]">Required</span>
                                </label>
                              </div>
                              {field.type === "select" && (
                                <div className="col-span-2">
                                  <label className={labelClass}>Options (comma-separated)</label>
                                  <input
                                    value={(field.options ?? []).join(", ")}
                                    onChange={(e) =>
                                      updateField(selectedStepIndex, field.id, {
                                        options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                                      })
                                    }
                                    placeholder="Option 1, Option 2, Option 3"
                                    className={inputClass}
                                  />
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => removeField(selectedStepIndex, field.id)}
                              className="text-[#ef4444] hover:text-[#dc2626] text-[12px] mt-4 shrink-0"
                              title="Remove field"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                      {(selectedStep.customFields ?? []).length === 0 && (
                        <p className="text-[12px] text-[#a1a1aa] text-center py-4">
                          No fields yet. Click &quot;+ Add Field&quot; to add one.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-[13px] text-[#a1a1aa]">
              Select a step to edit
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-[#e4e4e7] p-4 space-y-4">
            <div>
              <label className={labelClass}>Template Name</label>
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Default Application"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Slug</label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. default"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this template"
                rows={3}
                className={inputClass + " resize-none"}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="accent-[#15803d]"
              />
              <span className="text-[12px] text-[#71717a]">Default template</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPublished(!published)}
                className={`w-9 h-5 rounded-full transition-colors flex items-center ${
                  published ? "bg-[#15803d]" : "bg-[#d4d4d8]"
                }`}
              >
                <span
                  className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${
                    published ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-[12px] text-[#71717a]">{published ? "Published" : "Draft"}</span>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2.5 bg-[#15803d] hover:bg-[#166534] text-white text-[13px] font-semibold rounded-xl transition-colors disabled:opacity-60"
            >
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Template"}
            </button>

            {slug && (
              <a
                href={`/apply?template=${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center py-2.5 bg-[#f4f4f5] hover:bg-[#e4e4e7] text-[#71717a] text-[12px] font-medium rounded-xl transition-colors"
              >
                Preview Form ↗
              </a>
            )}

            {isEdit && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full py-2.5 bg-white border border-[#fecaca] hover:bg-[#fef2f2] text-[#ef4444] text-[12px] font-semibold rounded-xl transition-colors disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete Template"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
