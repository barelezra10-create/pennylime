"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { FormField } from "@/types/form-template";

interface DynamicStepProps {
  title: string;
  description: string;
  fields: FormField[];
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function DynamicStep({ title, description, fields, values, onChange, onNext, onBack }: DynamicStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const errs: Record<string, string> = {};
    for (const field of fields) {
      if (field.required && !values[field.id]?.trim()) {
        errs[field.id] = `${field.label} is required`;
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (validate()) onNext();
  }

  const sortedFields = [...fields].sort((a, b) => a.order - b.order);

  const inputClass = "w-full text-[14px] px-4 py-3 bg-[#f4f4f5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#15803d]/20";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col w-full max-w-[400px] mx-auto"
    >
      <h2 className="text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a]">{title}</h2>
      <p className="mt-2 text-sm text-[#71717a]">{description}</p>

      <div className="mt-8 space-y-4">
        {sortedFields.map((field) => (
          <div key={field.id}>
            <label className="text-[13px] font-semibold text-[#1a1a1a] mb-1.5 block">{field.label}{field.required && " *"}</label>
            {field.type === "text" && (
              <input type="text" value={values[field.id] || ""} onChange={(e) => onChange(field.id, e.target.value)} placeholder={field.placeholder} className={inputClass} />
            )}
            {field.type === "number" && (
              <input type="number" value={values[field.id] || ""} onChange={(e) => onChange(field.id, e.target.value)} placeholder={field.placeholder} className={inputClass} />
            )}
            {field.type === "textarea" && (
              <textarea value={values[field.id] || ""} onChange={(e) => onChange(field.id, e.target.value)} placeholder={field.placeholder} rows={3} className={inputClass} />
            )}
            {field.type === "select" && (
              <select value={values[field.id] || ""} onChange={(e) => onChange(field.id, e.target.value)} className={inputClass}>
                <option value="">Select...</option>
                {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            )}
            {field.type === "checkbox" && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={values[field.id] === "true"} onChange={(e) => onChange(field.id, String(e.target.checked))} className="rounded" />
                <span className="text-[13px] text-[#71717a]">{field.placeholder || field.label}</span>
              </label>
            )}
            {field.type === "file" && (
              <input type="file" onChange={(e) => onChange(field.id, e.target.files?.[0]?.name || "")} className="text-[13px] text-[#71717a]" />
            )}
            {errors[field.id] && <p className="text-[12px] text-red-500 mt-1">{errors[field.id]}</p>}
          </div>
        ))}
      </div>

      <div className="mt-8 flex gap-3">
        <button onClick={onBack} className="flex-1 py-3 rounded-xl text-[14px] font-semibold text-[#71717a] bg-[#f4f4f5] hover:bg-[#e5e7eb] transition-colors">
          Back
        </button>
        <button onClick={handleNext} className="flex-1 py-3 rounded-xl text-[14px] font-semibold text-white bg-[#15803d] hover:bg-[#166534] transition-colors">
          Continue
        </button>
      </div>
    </motion.div>
  );
}
