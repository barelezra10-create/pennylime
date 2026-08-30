"use client";

import { useState } from "react";
import { submitJobApplication } from "@/actions/hr";

export function HrApplyClient() {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const res = await submitJobApplication(fd);
      if (res.ok) {
        setDone(true);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-[#e4e4e7] bg-white p-8 text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[#f0fdf4] flex items-center justify-center text-[#15803d] text-[24px]">
          ✓
        </div>
        <h2 className="text-[18px] font-bold text-black mb-2">Application received</h2>
        <p className="text-[14px] text-[#71717a]">
          Thanks for applying. Our team will review your CV and reach out by email if it's a fit.
        </p>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-[#e4e4e7] px-3 py-2 text-[14px] outline-none focus:border-[#15803d]";
  const labelCls = "block text-[13px] font-semibold text-[#3f3f46] mb-1";

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-[#e4e4e7] bg-white p-6 space-y-4">
      <h2 className="text-[16px] font-bold text-black">Apply now</h2>

      {error && (
        <div className="rounded-lg bg-[#fef2f2] border border-[#fecaca] px-3 py-2 text-[13px] text-[#b91c1c]">
          {error}
        </div>
      )}

      <div>
        <label className={labelCls}>Full name *</label>
        <input name="fullName" required className={inputCls} placeholder="Jane Doe" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Email *</label>
          <input name="email" type="email" required className={inputCls} placeholder="you@email.com" />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input name="phone" className={inputCls} placeholder="(555) 555-5555" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>LinkedIn (optional)</label>
          <input name="linkedin" className={inputCls} placeholder="linkedin.com/in/…" />
        </div>
        <div>
          <label className={labelCls}>Years of underwriting experience</label>
          <input name="yearsExperience" className={inputCls} placeholder="e.g. 5" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-[13px] text-[#3f3f46]">
        <input type="checkbox" name="mcaExperience" className="h-4 w-4 accent-[#15803d]" />
        I have merchant cash advance (MCA) underwriting experience
      </label>

      <div>
        <label className={labelCls}>Anything you'd like us to know</label>
        <textarea name="message" rows={3} className={inputCls} placeholder="A short note about your background…" />
      </div>

      <div>
        <label className={labelCls}>CV / Resume * (PDF or Word)</label>
        <input
          name="cv"
          type="file"
          required
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => setFileName(e.target.files?.[0]?.name || null)}
          className="block w-full text-[13px] text-[#52525b] file:mr-3 file:rounded-md file:border-0 file:bg-[#15803d] file:px-3 file:py-1.5 file:text-white file:text-[13px] file:font-semibold hover:file:bg-[#166534]"
        />
        {fileName && <p className="mt-1 text-[12px] text-[#71717a]">Selected: {fileName}</p>}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-[#15803d] text-white text-[15px] font-semibold py-3 hover:bg-[#166534] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Submitting…" : "Submit application"}
      </button>
      <p className="text-[11px] text-[#a1a1aa] text-center">
        Your information is used only for recruiting and is kept confidential.
      </p>
    </form>
  );
}
