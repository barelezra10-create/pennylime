"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { toast } from "sonner";
import { usePlaidLink } from "react-plaid-link";
import { CheckCircle, Building2 } from "lucide-react";
import { submitApplication } from "@/actions/applications";
import { previewPlaidIncome, verifyApplicantIdentity } from "@/actions/plaid";
import { upsertContact, updateContactLastStep, linkContactApplication } from "@/actions/contacts";
import { logActivity } from "@/actions/activities";
import type { FormStep } from "@/types/form-template";
import { DynamicStep } from "@/components/apply/dynamic-step";
import { PhoneVerification } from "@/components/apply/phone-verification";
import { PlatformLogo } from "@/components/funnel/platform-logo";

/* ------------------------------------------------------------------ */
/*  CONSTANTS                                                           */
/* ------------------------------------------------------------------ */
const STEPS = ["Amount", "About you", "Your info", "Platforms", "Bank link", "Verified", "Review"];
// Loan term options in WEEKS. Max 16 weeks (≈4 months). Stored in loanTermMonths column for now.
const LOAN_TERMS = [1, 2, 3, 4, 6, 8, 12, 16];

const GIG_PLATFORMS = [
  { id: "uber", label: "Uber" },
  { id: "lyft", label: "Lyft" },
  { id: "doordash", label: "DoorDash" },
  { id: "ubereats", label: "Uber Eats" },
  { id: "instacart", label: "Instacart" },
  { id: "grubhub", label: "Grubhub" },
  { id: "amazonflex", label: "Amazon Flex" },
  { id: "postmates", label: "Postmates" },
  { id: "taskrabbit", label: "TaskRabbit" },
  { id: "fiverr", label: "Fiverr" },
  { id: "upwork", label: "Upwork" },
  { id: "shipt", label: "Shipt" },
  { id: "gopuff", label: "Gopuff" },
  { id: "spark", label: "Walmart Spark" },
];
const MIN_AMOUNT = 500;
const MAX_AMOUNT = 10000;
const STEP_SIZE = 100;
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg"];

const formSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  loanAmount: z.number().positive("Loan amount must be positive"),
});

/* ------------------------------------------------------------------ */
/*  NAVBAR                                                              */
/* ------------------------------------------------------------------ */
function Navbar() {
  return (
    <nav className="fixed top-0 z-50 w-full bg-[#fafaf7]/90 backdrop-blur-xl border-b border-[#e4e4e7]">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 sm:px-10 h-16 md:h-20">
        <Link href="/" className="inline-flex items-center min-h-[44px]">
          <span className="font-extrabold text-[18px] md:text-lg tracking-[-0.03em]">Penny<span className="text-[#15803d]">Lime<span className="text-[#15803d]">.</span></span></span>
        </Link>
        <Link
          href="/status"
          className="text-[13px] text-[#52525b] transition-colors hover:text-[#0a0a0a] inline-flex items-center min-h-[44px] px-2"
        >
          Check status
        </Link>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/*  STEP INDICATOR                                                      */
/* ------------------------------------------------------------------ */
function StepIndicator({ current, stepNames }: { current: number; stepNames: string[] }) {
  const total = stepNames.length;
  return (
    <div className="mb-8 w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-bold text-[#15803d]">Step {current + 1} of {total}</span>
        <span className="text-[13px] text-[#71717a]">{stepNames[current]}</span>
      </div>
      <div className="h-2 bg-[#e4e4e7] rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-[#15803d] rounded-full"
          initial={false}
          animate={{ width: `${((current + 1) / total) * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RIGHT SIDEBAR                                                       */
/* ------------------------------------------------------------------ */
function SidebarContent({ step, amount, loanTermMonths }: { step: number; amount: number; loanTermMonths: number }) {
  const weeklyEstimate = ((amount * 0.30 * Math.pow(1.30, loanTermMonths)) / (Math.pow(1.30, loanTermMonths) - 1)).toFixed(0);

  const content = [
    // Step 0: Amount
    <div key="s0" className="flex flex-col gap-8">
      <div>
        <p className="text-white/60 text-[11px] font-semibold uppercase tracking-[0.1em] mb-2">Your advance preview</p>
        <motion.div
          key={amount}
          initial={{ scale: 1.05, opacity: 0.7 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="text-[52px] font-extrabold tracking-[-0.04em] text-white leading-none"
        >
          ${amount.toLocaleString()}
        </motion.div>
        <p className="mt-2 text-white/70 text-[14px]">
          ~${weeklyEstimate}/wk for {loanTermMonths} {loanTermMonths === 1 ? "week" : "weeks"}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {[
          { icon: "✓", label: "No credit pull, ever" },
          { icon: "⚡", label: "Funded in 48 hours" },
          { icon: "📋", label: "Drivers, sellers, and operators welcome" },
          { icon: "🔒", label: "Bank-grade encryption end to end" },
        ].map((b) => (
          <div key={b.label} className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-[14px] flex-shrink-0">
              {b.icon}
            </div>
            <span className="text-[14px] text-white/90 font-medium">{b.label}</span>
          </div>
        ))}
      </div>
    </div>,

    // Step 1: Info
    <div key="s1" className="flex flex-col gap-8">
      <div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 mb-4">
          <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <h3 className="text-[22px] font-extrabold text-white tracking-tight">Your data is safe with us</h3>
        <p className="mt-2 text-white/70 text-[14px] leading-relaxed">
          All information is encrypted end-to-end and stored securely. We never sell your data.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {[
          "AES-256 encryption",
          "SOC 2 Type II compliant",
          "No data selling, ever",
          "CCPA & GDPR ready",
        ].map((b) => (
          <div key={b} className="flex items-center gap-3">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/30 flex-shrink-0">
              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <span className="text-[13px] text-white/80">{b}</span>
          </div>
        ))}
      </div>
      <div className="bg-white/10 rounded-xl px-4 py-3">
        <p className="text-[12px] text-white/60 mb-1">Progress</p>
        <p className="text-[16px] font-bold text-white">Step 2 of 7. You&apos;re doing great.</p>
      </div>
    </div>,

    // Step 2: Platforms
    <div key="s2" className="flex flex-col gap-8">
      <div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 mb-4">
          <span className="text-2xl">🚀</span>
        </div>
        <h3 className="text-[22px] font-extrabold text-white tracking-tight">Verified deposits, not credit</h3>
        <p className="mt-2 text-white/70 text-[14px] leading-relaxed">
          Your platform deposits are the proof. We size your advance to 90 days of real earnings, not a FICO score.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {["Uber", "Lyft", "DoorDash", "Instacart", "Amazon Flex", "Amazon FBA", "Shopify", "Fiverr"].map((p) => (
          <div key={p} className="bg-white/10 rounded-lg px-3 py-2 text-[13px] text-white/80 font-medium">
            {p}
          </div>
        ))}
      </div>
      <p className="text-white/50 text-[12px]">+ Etsy, Upwork, TaskRabbit, Rover, and more</p>
    </div>,

    // Step 3: Identity
    <div key="s3" className="flex flex-col gap-8">
      <div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 mb-4">
          <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>
        <h3 className="text-[22px] font-extrabold text-white tracking-tight">Bank-grade security</h3>
        <p className="mt-2 text-white/70 text-[14px] leading-relaxed">
          Your documents are encrypted and reviewed only by our secure verification system.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {[
          "Automatic ID verification",
          "Encrypted document storage",
          "Deleted after verification",
          "No third-party sharing",
        ].map((b) => (
          <div key={b} className="flex items-center gap-3">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/30 flex-shrink-0">
              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <span className="text-[13px] text-white/80">{b}</span>
          </div>
        ))}
      </div>
    </div>,

    // Step 4: Bank Link
    <div key="s4" className="flex flex-col gap-8">
      <div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 mb-4">
          <Building2 className="h-7 w-7 text-white" />
        </div>
        <h3 className="text-[22px] font-extrabold text-white tracking-tight">Read-only access</h3>
        <p className="mt-2 text-white/70 text-[14px] leading-relaxed">
          Plaid only reads your transaction history. We can never move money or make transactions on your behalf.
        </p>
      </div>
      <div className="bg-white/10 rounded-xl p-4">
        <p className="text-[13px] font-bold text-white mb-2">Powered by Plaid</p>
        <p className="text-[12px] text-white/70 leading-relaxed">
          Used by thousands of fintech apps. Your bank credentials are never shared with PennyLime.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {["Read-only income verification", "Zero transaction access", "10,000+ banks supported"].map((b) => (
          <div key={b} className="flex items-center gap-2 text-[13px] text-white/80">
            <div className="h-1.5 w-1.5 rounded-full bg-white/60 flex-shrink-0" />
            {b}
          </div>
        ))}
      </div>
    </div>,

    // Step 5: Documents
    <div key="s5" className="flex flex-col gap-8">
      <div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 mb-4">
          <span className="text-2xl">🎉</span>
        </div>
        <h3 className="text-[22px] font-extrabold text-white tracking-tight">Almost there.</h3>
        <p className="mt-2 text-white/70 text-[14px] leading-relaxed">
          Last step is your earnings statements. Then we underwrite from your verified deposits and get back to you fast.
        </p>
      </div>
      <div className="bg-white/10 rounded-xl p-4">
        <p className="text-[13px] font-bold text-white mb-3">What happens next</p>
        <div className="flex flex-col gap-3">
          {[
            { step: "1", label: "Review (1-2 hrs)" },
            { step: "2", label: "Approval decision" },
            { step: "3", label: "Funded in 48 hrs" },
          ].map((s) => (
            <div key={s.step} className="flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/30 text-[12px] font-bold text-white flex-shrink-0">
                {s.step}
              </div>
              <span className="text-[13px] text-white/80">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,

    // Step 6: Review
    <div key="s6" className="flex flex-col gap-6">
      <div>
        <p className="text-white/60 text-[11px] font-semibold uppercase tracking-[0.1em] mb-2">Advance summary</p>
        <div className="text-[48px] font-extrabold tracking-[-0.04em] text-white leading-none">
          ${amount.toLocaleString()}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="bg-white/10 rounded-xl px-4 py-3 flex justify-between items-center">
          <span className="text-[13px] text-white/70">Term</span>
          <span className="text-[14px] font-bold text-white">{loanTermMonths} {loanTermMonths === 1 ? "week" : "weeks"}</span>
        </div>
        <div className="bg-white/10 rounded-xl px-4 py-3 flex justify-between items-center">
          <span className="text-[13px] text-white/70">Weekly remittance</span>
          <span className="text-[14px] font-bold text-white">${weeklyEstimate}/wk</span>
        </div>
        <div className="bg-white/10 rounded-xl px-4 py-3 flex justify-between items-center">
          <span className="text-[13px] text-white/70">Total to repay</span>
          <span className="text-[14px] font-bold text-white">${(Number(weeklyEstimate) * loanTermMonths).toLocaleString()}</span>
        </div>
      </div>
      <p className="text-white/50 text-[12px] leading-relaxed">
        Estimated terms. Final factor rate and total cost shown above the fold of your offer. No prepayment penalty.
      </p>
    </div>,
  ];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.4 }}
      >
        {content[Math.min(step, content.length - 1)]}
      </motion.div>
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  STEP 1, LOAN AMOUNT                                               */
/* ------------------------------------------------------------------ */
function StepAmount({
  amount,
  setAmount,
  loanTermMonths,
  setLoanTermMonths,
  onNext,
}: {
  amount: number;
  setAmount: (v: number) => void;
  loanTermMonths: number;
  setLoanTermMonths: (v: number) => void;
  onNext: () => void;
}) {
  const pct = ((amount - MIN_AMOUNT) / (MAX_AMOUNT - MIN_AMOUNT)) * 100;
  // loanTermMonths field now holds WEEKS, compute weekly payment
  const weeklyEstimate = ((amount * 0.30 * Math.pow(1.30, loanTermMonths)) / (Math.pow(1.30, loanTermMonths) - 1)).toFixed(0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col w-full"
    >
      <h2 className="text-[30px] font-extrabold tracking-[-0.03em] text-[#0a0a0a]">
        How much do you need?
      </h2>
      <p className="mt-2 text-[15px] text-[#52525b]">
        Pick your advance amount. $500 to $10,000 for drivers, sellers, and operators.
      </p>

      {/* Big amount display */}
      <div className="mt-8 mb-6 text-center">
        <motion.span
          key={amount}
          className="text-[48px] font-extrabold text-[#15803d] tracking-[-0.04em]"
          initial={{ scale: 1.05, opacity: 0.7 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          ${amount.toLocaleString()}
        </motion.span>
      </div>

      {/* Custom range slider */}
      <div className="w-full px-1">
        <div className="relative h-[28px] md:h-[24px] w-full flex items-center">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[6px] rounded-full bg-[#e4e4e7]" />
          <motion.div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-[6px] rounded-full bg-[#15803d]"
            style={{ width: `${pct}%` }}
            layout
            transition={{ duration: 0.1 }}
          />
          <motion.div
            className="absolute top-1/2 h-[28px] w-[28px] md:h-[22px] md:w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-[#15803d] shadow-md pointer-events-none"
            style={{ left: `${pct}%` }}
            layout
            transition={{ duration: 0.1 }}
          />
          <input
            type="range"
            min={MIN_AMOUNT}
            max={MAX_AMOUNT}
            step={STEP_SIZE}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="absolute inset-0 w-full h-full cursor-pointer opacity-0 touch-manipulation"
            aria-label="Advance amount"
          />
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-[#52525b]">
          <span>${MIN_AMOUNT.toLocaleString()}</span>
          <span>${MAX_AMOUNT.toLocaleString()}</span>
        </div>
      </div>

      {/* Loan term selector */}
      <div className="mt-8 w-full">
        <p className="mb-3 text-[14px] font-semibold text-black">
          Repayment term
        </p>
        <div className="grid grid-cols-4 gap-2">
          {LOAN_TERMS.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => setLoanTermMonths(term)}
              className={`rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200 ${
                loanTermMonths === term
                  ? "bg-[#15803d] text-white"
                  : "bg-[#f0fdf4] text-[#52525b] hover:bg-[#dcfce7]"
              }`}
            >
              {term} {term === 1 ? "wk" : "wks"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[#71717a]">Maximum term: 16 weeks (about 4 months)</p>
      </div>

      {/* Weekly estimate */}
      <div className="mt-6 bg-[#f0fdf4] border border-[#dcfce7] rounded-xl p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-[#15803d] font-medium">Estimated weekly remittance</span>
          <span className="text-[18px] font-extrabold text-[#15803d]">${weeklyEstimate}/wk</span>
        </div>
        <p className="mt-1 text-[11px] text-[#15803d]/70">
          No credit pull. Sized to verified deposits.
        </p>
      </div>

      <motion.button
        type="button"
        onClick={onNext}
        className="mt-8 w-full rounded-xl bg-[#15803d] min-h-[52px] py-3 text-[15px] font-semibold text-white transition-all hover:bg-[#166534] shadow-[0_6px_16px_-8px_rgba(21,128,61,0.5)]"
        whileTap={{ scale: 0.97 }}
      >
        Continue &rarr;
      </motion.button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  US STATES LIST                                                      */
/* ------------------------------------------------------------------ */
const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DC", name: "Washington D.C." },
  { code: "DE", name: "Delaware" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];
const US_STATE_CODES = US_STATES.map((s) => s.code);

/* ------------------------------------------------------------------ */
/*  STEP 2, PERSONAL INFO                                             */
/* ------------------------------------------------------------------ */
type InfoForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
};

function StepInfo({
  form,
  setForm,
  errors,
  onNext,
  onBack,
}: {
  form: InfoForm;
  setForm: (f: InfoForm) => void;
  errors: Record<string, string>;
  onNext: () => void;
  onBack: () => void;
}) {
  // DOB split state
  const [dobMonth, setDobMonth] = useState(() => form.dob ? form.dob.slice(5, 7) : "");
  const [dobDay, setDobDay] = useState(() => form.dob ? form.dob.slice(8, 10) : "");
  const [dobYear, setDobYear] = useState(() => form.dob ? form.dob.slice(0, 4) : "");

  const updateDob = (m: string, d: string, y: string) => {
    if (m.length === 2 && d.length === 2 && y.length === 4) {
      setForm({ ...form, dob: `${y}-${m}-${d}` });
    } else {
      setForm({ ...form, dob: "" });
    }
  };

  const inputClass = (field: string) =>
    `w-full rounded-xl border bg-white px-4 py-3.5 text-[15px] text-[#0a0a0a] placeholder:text-[#a1a1aa] outline-none transition-all duration-200 ${
      errors[field]
        ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
        : "border-[#e4e4e7] focus:border-[#15803d] focus:ring-2 focus:ring-[#15803d]/20"
    }`;

  const selectClass = (field: string) =>
    `w-full rounded-xl border bg-white px-4 py-3.5 text-[15px] text-[#0a0a0a] outline-none transition-all duration-200 appearance-none ${
      errors[field]
        ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
        : "border-[#e4e4e7] focus:border-[#15803d] focus:ring-2 focus:ring-[#15803d]/20"
    }`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="w-full"
    >
      <h2 className="text-[30px] font-extrabold tracking-[-0.03em] text-[#0a0a0a]">
        A little about you
      </h2>
      <p className="mt-2 text-[15px] text-[#52525b]">
        Basic info so we can run identity and disburse funds.
      </p>

      <div className="mt-8 flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-[14px] font-semibold text-black">First name</label>
            <input
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              placeholder="Marcus"
              className={inputClass("firstName")}
            />
            {errors.firstName && <p className="mt-1 text-[12px] text-red-500">{errors.firstName}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-[14px] font-semibold text-black">Last name</label>
            <input
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              placeholder="Thompson"
              className={inputClass("lastName")}
            />
            {errors.lastName && <p className="mt-1 text-[12px] text-red-500">{errors.lastName}</p>}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[14px] font-semibold text-black">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="marcus@gmail.com"
            className={inputClass("email")}
          />
          {errors.email && <p className="mt-1 text-[12px] text-red-500">{errors.email}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-[14px] font-semibold text-black">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="(555) 123-4567"
            className={inputClass("phone")}
          />
          {errors.phone && <p className="mt-1 text-[12px] text-red-500">{errors.phone}</p>}
        </div>

        {/* Date of birth */}
        <div>
          <label className="mb-1.5 block text-[14px] font-semibold text-black">Date of birth</label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={dobMonth}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                  setDobMonth(v);
                  updateDob(v, dobDay, dobYear);
                }}
                placeholder="MM"
                className={`w-full rounded-xl border bg-white px-4 py-3.5 text-[15px] text-[#0a0a0a] placeholder:text-[#a1a1aa] outline-none transition-all duration-200 text-center ${
                  errors.dob
                    ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    : "border-[#e4e4e7] focus:border-[#15803d] focus:ring-2 focus:ring-[#15803d]/20"
                }`}
              />
            </div>
            <div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={dobDay}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                  setDobDay(v);
                  updateDob(dobMonth, v, dobYear);
                }}
                placeholder="DD"
                className={`w-full rounded-xl border bg-white px-4 py-3.5 text-[15px] text-[#0a0a0a] placeholder:text-[#a1a1aa] outline-none transition-all duration-200 text-center ${
                  errors.dob
                    ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    : "border-[#e4e4e7] focus:border-[#15803d] focus:ring-2 focus:ring-[#15803d]/20"
                }`}
              />
            </div>
            <div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={dobYear}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setDobYear(v);
                  updateDob(dobMonth, dobDay, v);
                }}
                placeholder="YYYY"
                className={`w-full rounded-xl border bg-white px-4 py-3.5 text-[15px] text-[#0a0a0a] placeholder:text-[#a1a1aa] outline-none transition-all duration-200 text-center ${
                  errors.dob
                    ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    : "border-[#e4e4e7] focus:border-[#15803d] focus:ring-2 focus:ring-[#15803d]/20"
                }`}
              />
            </div>
          </div>
          {errors.dob && <p className="mt-1 text-[12px] text-red-500">{errors.dob}</p>}
        </div>

        {/* Address */}
        <div>
          <label className="mb-1.5 block text-[14px] font-semibold text-black">Home address</label>
          <div className="flex flex-col gap-3">
            <div>
              <input
                value={form.addressStreet}
                onChange={(e) => setForm({ ...form, addressStreet: e.target.value })}
                placeholder="123 Main Street"
                className={inputClass("addressStreet")}
              />
              {errors.addressStreet && <p className="mt-1 text-[12px] text-red-500">{errors.addressStreet}</p>}
            </div>
            <div>
              <input
                value={form.addressCity}
                onChange={(e) => setForm({ ...form, addressCity: e.target.value })}
                placeholder="City"
                className={inputClass("addressCity")}
              />
              {errors.addressCity && <p className="mt-1 text-[12px] text-red-500">{errors.addressCity}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <select
                  value={form.addressState}
                  onChange={(e) => setForm({ ...form, addressState: e.target.value })}
                  className={selectClass("addressState")}
                >
                  <option value="">State</option>
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  <svg className="h-4 w-4 text-[#a1a1aa]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
                {errors.addressState && <p className="mt-1 text-[12px] text-red-500">{errors.addressState}</p>}
              </div>
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={form.addressZip}
                  onChange={(e) => setForm({ ...form, addressZip: e.target.value.replace(/\D/g, "").slice(0, 5) })}
                  placeholder="ZIP"
                  className={inputClass("addressZip")}
                />
                {errors.addressZip && <p className="mt-1 text-[12px] text-red-500">{errors.addressZip}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-[#f0fdf4] min-h-[52px] py-3 text-[15px] font-semibold text-[#15803d] transition-all hover:bg-[#dcfce7]"
        >
          &larr; Back
        </button>
        <motion.button
          type="button"
          onClick={onNext}
          className="rounded-xl bg-[#15803d] min-h-[52px] py-3 text-[15px] font-semibold text-white transition-all hover:bg-[#166534] shadow-[0_6px_16px_-8px_rgba(21,128,61,0.5)]"
          whileTap={{ scale: 0.97 }}
        >
          Continue &rarr;
        </motion.button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  STEP 3, GIG PLATFORMS & EARNINGS                                   */
/* ------------------------------------------------------------------ */
const WORKER_TYPES = [
  {
    id: "BUSINESS_OWNER",
    title: "I'm a Business Owner",
    description: "Best if you earn income through your own business.",
    bullets: ["Accepts payments from customers", "Manages business expenses", "Income from multiple clients or platforms"],
  },
  {
    id: "INDEPENDENT_CONTRACTOR",
    title: "I'm an Independent Contractor",
    description: "Best if you work for yourself and earn income per job, contract, or gig.",
    bullets: ["Gig workers (Uber, DoorDash, TaskRabbit, etc.)", "Freelancers or 1099 contractors", "Income from multiple clients or platforms"],
  },
  {
    id: "NOT_SURE",
    title: "Not sure which fits me",
    description: "Choose this option if you don't earn contractor or business income.",
    bullets: ["W-2 Employee", "Unemployed", "Retired or disabled", "Other non-contractor income"],
  },
];

const MONTHS = [
  { value: 1, label: "January" }, { value: 2, label: "February" },
  { value: 3, label: "March" }, { value: 4, label: "April" },
  { value: 5, label: "May" }, { value: 6, label: "June" },
  { value: 7, label: "July" }, { value: 8, label: "August" },
  { value: 9, label: "September" }, { value: 10, label: "October" },
  { value: 11, label: "November" }, { value: 12, label: "December" },
];

/* ------------------------------------------------------------------ */
/*  STEP 2, WORKER CLASSIFICATION                                     */
/* ------------------------------------------------------------------ */
function StepWorkerType({
  workerType,
  setWorkerType,
  setPlatforms,
  setOtherPlatform,
  onNext,
  onBack,
}: {
  workerType: string;
  setWorkerType: (v: string) => void;
  setPlatforms: (p: string[]) => void;
  setOtherPlatform: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="w-full"
    >
      <h2 className="text-[30px] font-extrabold tracking-[-0.03em] text-[#0a0a0a]">
        How do you earn?
      </h2>
      <p className="mt-2 text-[15px] text-[#52525b]">
        Are you a gig worker or running your own business? This tailors the rest of the form to you.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {WORKER_TYPES.map((wt) => {
          const selected = workerType === wt.id;
          return (
            <button
              key={wt.id}
              type="button"
              onClick={() => {
                setWorkerType(wt.id);
                // Coming back and switching answer should reset auto-seeded
                // platform state so the next step renders fresh.
                if (wt.id === "BUSINESS_OWNER") {
                  setPlatforms(["other"]);
                } else if (workerType === "BUSINESS_OWNER") {
                  setPlatforms([]);
                  setOtherPlatform("");
                }
              }}
              className={`flex flex-col text-left rounded-xl border px-4 py-3.5 transition-all duration-200 ${
                selected
                  ? "border-[#15803d] bg-[#f0fdf4] ring-2 ring-[#15803d]/20"
                  : "border-[#e4e4e7] bg-white hover:border-[#15803d]/50 hover:bg-[#f0fdf4]/50"
              }`}
            >
              <div className="flex items-center gap-3 mb-1.5">
                <div className={`h-4 w-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center ${selected ? "border-[#15803d] bg-[#15803d]" : "border-[#a1a1aa]"}`}>
                  {selected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                <span className={`text-[14px] font-semibold ${selected ? "text-[#15803d]" : "text-[#0a0a0a]"}`}>{wt.title}</span>
              </div>
              <p className={`text-[12px] mb-2 ml-7 ${selected ? "text-[#15803d]/70" : "text-[#71717a]"}`}>{wt.description}</p>
              <ul className="ml-7 flex flex-col gap-0.5">
                {wt.bullets.map((b) => (
                  <li key={b} className={`text-[11px] flex items-start gap-1.5 ${selected ? "text-[#15803d]/70" : "text-[#71717a]"}`}>
                    <span className="mt-0.5 flex-shrink-0">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-[#f0fdf4] min-h-[52px] py-3 text-[15px] font-semibold text-[#15803d] transition-all hover:bg-[#dcfce7]"
        >
          &larr; Back
        </button>
        <motion.button
          type="button"
          onClick={() => {
            if (!workerType) {
              toast.error("Please select how you earn");
              return;
            }
            onNext();
          }}
          className="rounded-xl bg-[#15803d] min-h-[52px] py-3 text-[15px] font-semibold text-white transition-all hover:bg-[#166534] shadow-[0_6px_16px_-8px_rgba(21,128,61,0.5)]"
          whileTap={{ scale: 0.97 }}
        >
          Continue &rarr;
        </motion.button>
      </div>
    </motion.div>
  );
}

function StepPlatforms({
  platforms,
  setPlatforms,
  otherPlatform,
  setOtherPlatform,
  weeklyEarnings,
  setWeeklyEarnings,
  workerType,
  setWorkerType,
  workStartMonth,
  setWorkStartMonth,
  workStartYear,
  setWorkStartYear,
  onNext,
  onBack,
}: {
  platforms: string[];
  setPlatforms: (p: string[]) => void;
  otherPlatform: string;
  setOtherPlatform: (v: string) => void;
  weeklyEarnings: string;
  setWeeklyEarnings: (v: string) => void;
  workerType: string;
  setWorkerType: (v: string) => void;
  workStartMonth: number;
  setWorkStartMonth: (v: number) => void;
  workStartYear: number;
  setWorkStartYear: (v: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const workYears = Array.from({ length: 31 }, (_, i) => currentYear - i);
  const togglePlatform = (id: string) => {
    setPlatforms(
      platforms.includes(id) ? platforms.filter((p) => p !== id) : [...platforms, id]
    );
  };

  const hasOther = platforms.includes("other");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="w-full"
    >
      <h2 className="text-[30px] font-extrabold tracking-[-0.03em] text-[#0a0a0a]">
        {workerType === "BUSINESS_OWNER" ? "Tell us about your business" : "Where do you earn?"}
      </h2>
      <p className="mt-2 text-[15px] text-[#52525b]">
        {workerType === "BUSINESS_OWNER"
          ? "Your business name and weekly revenue help us size the advance."
          : "Pick every platform that pays you. We size the advance to all of them combined."}
      </p>

      {/* Business name (BUSINESS_OWNER only) */}
      {workerType === "BUSINESS_OWNER" && (
        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <label className="mb-1.5 block text-[14px] font-semibold text-black">Business name</label>
          <p className="mb-3 text-[12px] text-[#a1a1aa]">The legal or DBA name customers pay.</p>
          <input
            value={otherPlatform}
            onChange={(e) => setOtherPlatform(e.target.value)}
            placeholder="Acme LLC"
            className="w-full rounded-xl border border-[#e4e4e7] bg-white px-4 py-3.5 text-[15px] text-[#0a0a0a] placeholder:text-[#a1a1aa] outline-none transition-all focus:border-[#15803d] focus:ring-2 focus:ring-[#15803d]/20"
          />
        </motion.div>
      )}

      {/* Platform grid (gig workers + not sure) */}
      {workerType && workerType !== "BUSINESS_OWNER" && (
      <>
      <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {GIG_PLATFORMS.map((p) => {
          const selected = platforms.includes(p.id);
          return (
            <motion.button
              key={p.id}
              type="button"
              onClick={() => togglePlatform(p.id)}
              className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-left text-sm transition-all duration-200 ${
                selected
                  ? "bg-[#15803d] text-white"
                  : "bg-[#f0fdf4] text-[#52525b] hover:bg-[#dcfce7]"
              }`}
              whileTap={{ scale: 0.97 }}
            >
              <PlatformLogo slug={p.id} label={p.label} selected={selected} />
              <span className="text-[13px] font-medium">
                {p.label}
              </span>
              {selected && (
                <motion.div
                  className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-white/20"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </motion.div>
              )}
            </motion.button>
          );
        })}

        {/* Other option */}
        <motion.button
          type="button"
          onClick={() => togglePlatform("other")}
          className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-left text-sm transition-all duration-200 ${
            hasOther
              ? "bg-[#15803d] text-white"
              : "bg-[#f0fdf4] text-[#52525b] hover:bg-[#dcfce7]"
          }`}
          whileTap={{ scale: 0.97 }}
        >
          <span className="text-lg">+</span>
          <span className="text-[13px] font-medium">
            Other
          </span>
          {hasOther && (
            <motion.div
              className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-white/20"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </motion.div>
          )}
        </motion.button>
      </div>

      {/* Other platform text input */}
      {hasOther && (
        <motion.div
          className="mt-3"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.2 }}
        >
          <input
            value={otherPlatform}
            onChange={(e) => setOtherPlatform(e.target.value)}
            placeholder="Enter platform name..."
            className="w-full rounded-xl border border-[#e4e4e7] bg-white px-4 py-3.5 text-[15px] text-[#0a0a0a] placeholder:text-[#a1a1aa] outline-none transition-all focus:border-[#15803d] focus:ring-2 focus:ring-[#15803d]/20"
          />
        </motion.div>
      )}

      {/* Selected count */}
      {platforms.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[#15803d]" />
          <span className="text-[13px] font-medium text-[#15803d]">
            {platforms.length} platform{platforms.length !== 1 ? "s" : ""} selected
          </span>
        </div>
      )}
      </>
      )}

      {/* Average weekly earnings (or revenue for business owners) */}
      {workerType && (
      <div className="mt-8">
        <label className="mb-1.5 block text-[14px] font-semibold text-black">
          {workerType === "BUSINESS_OWNER"
            ? "Avg. Weekly Revenue (past 12 months)"
            : "Avg. Weekly Earnings (past 12 months)"}
        </label>
        <p className="mb-3 text-[12px] text-[#a1a1aa]">
          {workerType === "BUSINESS_OWNER"
            ? "Your best estimate of weekly business revenue across all customers."
            : "Your best estimate across all platforms combined."}
        </p>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-medium text-[#a1a1aa]">$</span>
          <input
            type="number"
            min="0"
            step="50"
            value={weeklyEarnings}
            onChange={(e) => setWeeklyEarnings(e.target.value)}
            placeholder="800"
            className="w-full rounded-xl border border-[#e4e4e7] bg-white pl-8 pr-24 py-3.5 text-[15px] text-[#0a0a0a] placeholder:text-[#a1a1aa] outline-none transition-all focus:border-[#15803d] focus:ring-2 focus:ring-[#15803d]/20"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-[#a1a1aa]">/ week</span>
        </div>
        {weeklyEarnings && Number(weeklyEarnings) > 0 && (
          <motion.p
            className="mt-2 text-[12px] text-[#15803d] font-medium"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            That&apos;s ~${(Number(weeklyEarnings) * 4.33).toLocaleString(undefined, { maximumFractionDigits: 0 })}/month or ~${(Number(weeklyEarnings) * 52).toLocaleString(undefined, { maximumFractionDigits: 0 })}/year
          </motion.p>
        )}
      </div>
      )}

      {/* Work start date */}
      {workerType && (
      <div className="mt-8">
        <label className="mb-1.5 block text-[14px] font-semibold text-black">
          {workerType === "BUSINESS_OWNER" ? "When did you start your business?" : "When did you start this work?"}
        </label>
        <p className="mb-3 text-[12px] text-[#a1a1aa]">
          {workerType === "BUSINESS_OWNER"
            ? "The month and year your business started taking customers."
            : "The month and year you began earning from gigs, contracts, or your business."}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <select
              value={workStartMonth}
              onChange={(e) => setWorkStartMonth(Number(e.target.value))}
              className="w-full rounded-xl border border-[#e4e4e7] bg-white px-4 py-3.5 text-[15px] text-[#0a0a0a] outline-none transition-all focus:border-[#15803d] focus:ring-2 focus:ring-[#15803d]/20 appearance-none"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
              <svg className="h-4 w-4 text-[#a1a1aa]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>
          <div className="relative">
            <select
              value={workStartYear}
              onChange={(e) => setWorkStartYear(Number(e.target.value))}
              className="w-full rounded-xl border border-[#e4e4e7] bg-white px-4 py-3.5 text-[15px] text-[#0a0a0a] outline-none transition-all focus:border-[#15803d] focus:ring-2 focus:ring-[#15803d]/20 appearance-none"
            >
              {workYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
              <svg className="h-4 w-4 text-[#a1a1aa]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-[#f0fdf4] min-h-[52px] py-3 text-[15px] font-semibold text-[#15803d] transition-all hover:bg-[#dcfce7]"
        >
          &larr; Back
        </button>
        <motion.button
          type="button"
          onClick={() => {
            if (!workerType) {
              toast.error("Please select how you work");
              return;
            }
            if (workerType === "BUSINESS_OWNER") {
              if (!otherPlatform.trim()) {
                toast.error("Please enter your business name");
                return;
              }
            } else {
              if (platforms.length === 0) {
                toast.error("Select at least one platform");
                return;
              }
              if (hasOther && !otherPlatform.trim()) {
                toast.error("Please enter your platform name");
                return;
              }
            }
            if (!weeklyEarnings || Number(weeklyEarnings) <= 0) {
              toast.error(workerType === "BUSINESS_OWNER" ? "Enter your average weekly revenue" : "Enter your average weekly earnings");
              return;
            }
            if (!workStartMonth || !workStartYear) {
              toast.error("Please select when you started working");
              return;
            }
            onNext();
          }}
          className="rounded-xl bg-[#15803d] min-h-[52px] py-3 text-[15px] font-semibold text-white transition-all hover:bg-[#166534] shadow-[0_6px_16px_-8px_rgba(21,128,61,0.5)]"
          whileTap={{ scale: 0.97 }}
        >
          Continue &rarr;
        </motion.button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  STEP 4, PLAID BANK LINK                                           */
/* ------------------------------------------------------------------ */
function StepPlaidLink({
  plaidAccessToken,
  plaidAccountId,
  plaidItemId,
  setPlaidData,
  onNext,
  onBack,
}: {
  plaidAccessToken: string | null;
  plaidAccountId: string | null;
  plaidItemId: string | null;
  setPlaidData: (data: { accessToken: string; accountId: string; itemId: string }) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewIncome, setPreviewIncome] = useState<{
    monthlyIncome: number;
    bankBalance: number | null;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const linked = !!(plaidAccessToken && plaidAccountId && plaidItemId);

  // Detect OAuth return: when an OAuth bank (Chase, Capital One, etc.)
  // sends the user back, the URL contains `?oauth_state_id=...`. In that
  // case we must reuse the link_token from before the OAuth handoff (Plaid
  // tracks the OAuth state by token), not create a new one.
  const isOAuthReturn =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("oauth_state_id");
  const oauthReceivedRedirectUri =
    typeof window !== "undefined" && isOAuthReturn ? window.location.href : undefined;

  useEffect(() => {
    if (linked) return;

    // OAuth return: restore the saved link token instead of minting a new one.
    if (isOAuthReturn) {
      const saved = typeof window !== "undefined"
        ? window.sessionStorage.getItem("pennylime_plaid_link_token")
        : null;
      if (saved) {
        setLinkToken(saved);
        return;
      }
      // No saved token (user cleared storage or cross-device) — fall through
      // to mint a fresh one. The OAuth flow won't resume but they can retry.
    }

    const fetchToken = async () => {
      try {
        setLoading(true);
        const tempId = crypto.randomUUID();
        const res = await fetch("/api/plaid/create-link-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: tempId }),
        });
        if (!res.ok) throw new Error("Failed to create link token");
        const data = await res.json();
        setLinkToken(data.linkToken);
        // Persist the token so we can restore it if Plaid's OAuth step
        // bounces the user out to a bank and back.
        try {
          window.sessionStorage.setItem("pennylime_plaid_link_token", data.linkToken);
        } catch {}
      } catch (err) {
        toast.error("Could not initialize bank connection. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchToken();
  }, [linked, isOAuthReturn]);

  // Once linked, fetch the verified income preview to show as a trust signal.
  // Re-fetches if the user backs out and re-links (token changes).
  useEffect(() => {
    if (!plaidAccessToken) {
      setPreviewIncome(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    previewPlaidIncome({ encryptedAccessToken: plaidAccessToken })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setPreviewIncome({ monthlyIncome: res.monthlyIncome, bankBalance: res.bankBalance });
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plaidAccessToken]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    receivedRedirectUri: oauthReceivedRedirectUri,
    onSuccess: async (publicToken, metadata) => {
      try {
        setLoading(true);
        const res = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicToken,
            accountId: metadata.accounts[0]?.id,
          }),
        });
        if (!res.ok) throw new Error("Failed to link bank account");
        const data = await res.json();
        setPlaidData({
          accessToken: data.accessToken,
          accountId: data.accountId,
          itemId: data.itemId,
        });
        toast.success("Bank account linked successfully!");
      } catch (err) {
        toast.error("Failed to link bank account. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    onExit: () => {},
  });

  // OAuth return: as soon as Plaid Link is ready with our restored token,
  // auto-call open() so the bank's response is processed without requiring
  // the user to click "Link bank" again. Plaid SDK detects the
  // receivedRedirectUri and finishes the flow internally.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (
      !autoOpenedRef.current &&
      isOAuthReturn &&
      ready &&
      linkToken &&
      !linked
    ) {
      autoOpenedRef.current = true;
      open();
    }
  }, [isOAuthReturn, ready, linkToken, linked, open]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="w-full"
    >
      <h2 className="text-[30px] font-extrabold tracking-[-0.03em] text-[#0a0a0a]">
        Link your bank
      </h2>
      <p className="mt-2 text-[15px] text-[#52525b]">
        Plaid securely connects your bank so we can read 90 days of platform deposits and set up disbursement.
      </p>

      <div className="mt-8">
        {linked ? (
          <motion.div
            className="flex flex-col items-center gap-4 rounded-xl border border-[#dcfce7] bg-[#f0fdf4] p-8"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#15803d]">
              <CheckCircle className="h-8 w-8 text-white" />
            </div>
            <div className="text-center">
              <p className="text-[16px] font-bold text-[#0a0a0a]">Bank linked</p>
              <p className="mt-1 text-[13px] text-[#52525b]">
                Your bank is securely connected. We can read deposits, never move money.
              </p>
            </div>
            {previewLoading && !previewIncome ? (
              <p className="text-[12px] text-[#52525b]">Verifying your deposits…</p>
            ) : previewIncome ? (
              <motion.div
                className="w-full rounded-xl bg-white border border-[#dcfce7] px-4 py-3 grid grid-cols-2 gap-3"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[#52525b] font-semibold">Verified income</p>
                  <p className="text-[18px] font-extrabold text-[#15803d]">
                    ${Math.round(previewIncome.monthlyIncome).toLocaleString()}
                    <span className="text-[12px] font-medium text-[#52525b]">/mo</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wide text-[#52525b] font-semibold">Balance</p>
                  <p className="text-[18px] font-extrabold text-[#0a0a0a]">
                    {previewIncome.bankBalance != null
                      ? `$${Math.round(previewIncome.bankBalance).toLocaleString()}`
                      : "—"}
                  </p>
                </div>
              </motion.div>
            ) : null}
          </motion.div>
        ) : (
          <div className="flex flex-col items-center gap-6 rounded-xl border border-[#e4e4e7] bg-white p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#f0fdf4]">
              <Building2 className="h-8 w-8 text-[#15803d]" />
            </div>
            <div className="text-center">
              <p className="text-[15px] font-semibold text-[#0a0a0a]">
                Connect with Plaid
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-[#52525b]">
                Plaid handles the connection. Your bank credentials are never seen or stored by PennyLime.
              </p>
            </div>
            <motion.button
              type="button"
              onClick={() => open()}
              disabled={!ready || loading}
              className="w-full rounded-xl bg-[#15803d] text-white py-3 text-[15px] font-semibold transition-all hover:bg-[#166534] disabled:opacity-50 shadow-[0_6px_16px_-8px_rgba(21,128,61,0.5)]"
              whileTap={!ready || loading ? {} : { scale: 0.97 }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Connecting...
                </span>
              ) : (
                <>
                  <Building2 className="mr-2 inline h-4 w-4" />
                  Link bank
                </>
              )}
            </motion.button>
          </div>
        )}
      </div>

      {/* Security note */}
      <div className="mt-6 flex items-start gap-2 bg-[#f0fdf4] border border-[#dcfce7] rounded-xl px-4 py-3">
        <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#15803d]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
        <p className="text-[11px] leading-relaxed text-[#15803d]">
          Plaid uses bank-grade encryption. PennyLime never sees your login credentials and cannot move money on your behalf.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-[#f0fdf4] min-h-[52px] py-3 text-[15px] font-semibold text-[#15803d] transition-all hover:bg-[#dcfce7]"
        >
          &larr; Back
        </button>
        <motion.button
          type="button"
          onClick={() => {
            if (!linked) {
              toast.error("Please link your bank account to continue");
              return;
            }
            onNext();
          }}
          className="rounded-xl bg-[#15803d] min-h-[52px] py-3 text-[15px] font-semibold text-white transition-all hover:bg-[#166534] shadow-[0_6px_16px_-8px_rgba(21,128,61,0.5)]"
          whileTap={{ scale: 0.97 }}
        >
          Continue &rarr;
        </motion.button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  STEP 5, IDENTITY VERIFIED                                         */
/* ------------------------------------------------------------------ */
function StepVerified({
  plaidAccessToken,
  firstName,
  lastName,
  setIdentityResult,
  identityResult,
  onNext,
  onBack,
}: {
  plaidAccessToken: string | null;
  firstName: string;
  lastName: string;
  setIdentityResult: (r: { needsReview: boolean; matchedName: string | null }) => void;
  identityResult: { needsReview: boolean; matchedName: string | null } | null;
  onNext: () => void;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!plaidAccessToken || identityResult) return;
    let cancelled = false;
    setLoading(true);
    verifyApplicantIdentity({ encryptedAccessToken: plaidAccessToken, firstName, lastName })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setIdentityResult({
            needsReview: !res.match,
            matchedName: res.matchedName,
          });
        } else {
          // If the verification call itself errors, flag for review rather than
          // hard-fail the funnel — admin can rerun it.
          setIdentityResult({ needsReview: true, matchedName: null });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plaidAccessToken, firstName, lastName, identityResult, setIdentityResult]);

  const verified = identityResult && !identityResult.needsReview;
  const needsReview = identityResult && identityResult.needsReview;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="w-full"
    >
      <h2 className="text-[30px] font-extrabold tracking-[-0.03em] text-[#0a0a0a]">
        Identity check
      </h2>
      <p className="mt-2 text-[15px] text-[#52525b]">
        We use the name on your bank account from Plaid to confirm it&rsquo;s you. No photo ID, no paperwork.
      </p>

      <div className="mt-8">
        {loading || !identityResult ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-[#e4e4e7] bg-white p-8">
            <svg className="h-8 w-8 animate-spin text-[#15803d]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-[14px] text-[#52525b]">Checking your bank&rsquo;s account holder name&hellip;</p>
          </div>
        ) : verified ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center gap-4 rounded-xl border border-[#dcfce7] bg-[#f0fdf4] p-8"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#15803d]">
              <CheckCircle className="h-8 w-8 text-white" />
            </div>
            <div className="text-center">
              <p className="text-[16px] font-bold text-[#0a0a0a]">Identity verified</p>
              <p className="mt-1 text-[13px] text-[#52525b]">
                Your bank confirms you&rsquo;re {identityResult.matchedName || `${firstName} ${lastName}`}.
              </p>
            </div>
          </motion.div>
        ) : needsReview ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center gap-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-8"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f59e0b]">
              <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.732 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-[16px] font-bold text-[#0a0a0a]">We&rsquo;ll double-check this</p>
              <p className="mt-1 text-[13px] text-[#52525b]">
                The name on your bank doesn&rsquo;t match exactly. You can still continue. Our team will manually confirm
                before approval.
              </p>
            </div>
          </motion.div>
        ) : null}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-[#f0fdf4] min-h-[52px] py-3 text-[15px] font-semibold text-[#15803d] transition-all hover:bg-[#dcfce7]"
        >
          &larr; Back
        </button>
        <motion.button
          type="button"
          onClick={onNext}
          disabled={!identityResult || loading}
          className="rounded-xl bg-[#15803d] min-h-[52px] py-3 text-[15px] font-semibold text-white transition-all hover:bg-[#166534] disabled:opacity-50 shadow-[0_6px_16px_-8px_rgba(21,128,61,0.5)]"
          whileTap={{ scale: 0.97 }}
        >
          Continue &rarr;
        </motion.button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  STEP 6, REVIEW & SUBMIT                                           */
/* ------------------------------------------------------------------ */
function StepReview({
  amount,
  loanTermMonths,
  form,
  platforms,
  otherPlatform,
  weeklyEarnings,
  bankLinked,
  identityNeedsReview,
  submitting,
  onBack,
  onSubmit,
}: {
  amount: number;
  loanTermMonths: number;
  form: { firstName: string; lastName: string; email: string; phone: string };
  platforms: string[];
  otherPlatform: string;
  weeklyEarnings: string;
  bankLinked: boolean;
  identityNeedsReview: boolean;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const platformLabels = platforms
    .map((id) => {
      if (id === "other") return otherPlatform || "Other";
      return GIG_PLATFORMS.find((p) => p.id === id)?.label || id;
    })
    .join(", ");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="w-full"
    >
      <h2 className="text-[30px] font-extrabold tracking-[-0.03em] text-[#0a0a0a]">
        Review and submit
      </h2>
      <p className="mt-2 text-[15px] text-[#52525b]">
        Final check. Your factor rate and total cost are disclosed in plain English on the next screen, before you commit.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        {/* Amount card */}
        <div className="bg-[#f0fdf4] border border-[#dcfce7] rounded-xl p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#15803d]">Advance amount</p>
              <p className="mt-1 text-[32px] font-extrabold tracking-[-0.03em] text-[#15803d]">
                ${amount.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#71717a]">Repayment term</p>
              <p className="mt-1 text-[18px] font-bold text-[#0a0a0a]">{loanTermMonths} {loanTermMonths === 1 ? "week" : "weeks"}</p>
            </div>
          </div>
        </div>

        {/* Info card */}
        <div className="bg-[#f4f4f5] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#71717a]">Your information</p>
            <button type="button" className="text-[#15803d] text-sm hover:text-[#166534] transition-colors font-medium">Edit</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Name", value: `${form.firstName} ${form.lastName}` },
              { label: "Email", value: form.email },
              { label: "Phone", value: form.phone },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-[11px] text-[#a1a1aa]">{item.label}</p>
                <p className="mt-0.5 text-[13px] font-medium text-[#1a1a1a] truncate">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Platforms & Earnings card */}
        <div className="bg-[#f4f4f5] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#71717a]">Platforms and deposits</p>
            <button type="button" className="text-[#15803d] text-sm hover:text-[#166534] transition-colors font-medium">Edit</button>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[11px] text-[#71717a]">Platforms</p>
              <p className="mt-0.5 text-[13px] font-medium text-[#0a0a0a]">{platformLabels}</p>
            </div>
            <div>
              <p className="text-[11px] text-[#71717a]">Avg. weekly deposits</p>
              <p className="mt-0.5 text-[13px] font-medium text-[#15803d]">
                ${Number(weeklyEarnings).toLocaleString()}/week (about ${(Number(weeklyEarnings) * 52).toLocaleString()}/year)
              </p>
            </div>
          </div>
        </div>

        {/* Bank link + identity card */}
        <div className="bg-[#f4f4f5] rounded-xl p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#71717a]">Bank &amp; identity</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[13px]">
              <div className={`h-1.5 w-1.5 rounded-full ${bankLinked ? "bg-[#15803d]" : "bg-[#f59e0b]"}`} />
              <span className="font-medium text-[#0a0a0a]">
                {bankLinked ? "Bank linked via Plaid" : "Not linked"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[13px]">
              <div className={`h-1.5 w-1.5 rounded-full ${identityNeedsReview ? "bg-[#f59e0b]" : "bg-[#15803d]"}`} />
              <span className="font-medium text-[#0a0a0a]">
                {identityNeedsReview ? "Identity flagged for manual review" : "Identity verified"}
              </span>
            </div>
          </div>
        </div>

      </div>

      <div className="mt-8 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="rounded-xl bg-[#f0fdf4] min-h-[52px] py-3 text-[15px] font-semibold text-[#15803d] transition-all hover:bg-[#dcfce7] disabled:opacity-50"
        >
          &larr; Back
        </button>
        <motion.button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="rounded-xl bg-[#15803d] min-h-[52px] py-3 text-[15px] font-semibold text-white transition-all hover:bg-[#166534] shadow-[0_6px_16px_-8px_rgba(21,128,61,0.5)] disabled:opacity-70"
          whileTap={submitting ? {} : { scale: 0.97 }}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Submitting...
            </span>
          ) : (
            <>
              Submit application &rarr;
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  SUCCESS SCREEN                                                      */
/* ------------------------------------------------------------------ */
function VerifyingScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    // Smoothly animate from 1% to 100% over ~6 seconds with a slight curve
    // so it feels like real work, not a fixed timer. Once it hits 100%, hand
    // off to SuccessScreen via onDone.
    const start = Date.now();
    const totalMs = 6000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      // Ease-out: spend more time near the start, sprint at the end
      const linear = Math.min(1, elapsed / totalMs);
      const eased = 1 - Math.pow(1 - linear, 2);
      const pct = Math.max(1, Math.round(eased * 100));
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(interval);
        setTimeout(onDone, 300);
      }
    }, 80);
    return () => clearInterval(interval);
  }, [onDone]);

  const messages = [
    { threshold: 0, text: "Reading your bank deposits…" },
    { threshold: 25, text: "Verifying your identity…" },
    { threshold: 55, text: "Calculating your advance amount…" },
    { threshold: 80, text: "Almost done…" },
  ];
  const currentMessage = [...messages].reverse().find((m) => progress >= m.threshold)?.text || messages[0].text;

  return (
    <motion.div
      key="verifying"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center text-center w-full"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#f0fdf4] border-2 border-[#dcfce7]">
        <svg className="h-10 w-10 animate-spin text-[#15803d]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
      <h2 className="mt-6 text-[28px] md:text-[30px] font-extrabold tracking-[-0.03em] text-[#0a0a0a]">
        We&apos;re verifying your information
      </h2>
      <p className="mt-2 text-[14px] text-[#52525b]">{currentMessage}</p>

      <div className="mt-8 w-full max-w-md">
        <div className="h-2 rounded-full bg-[#f4f4f5] overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-[#15803d]"
            initial={{ width: "0%" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.2 }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-[#71717a]">Underwriting in progress</span>
          <span className="text-[11px] font-semibold text-[#15803d] tabular-nums">{progress}%</span>
        </div>
      </div>

      <div className="mt-6 inline-flex items-start gap-2 rounded-lg bg-[#fffbeb] border border-[#fde68a] px-3 py-2 max-w-md">
        <span className="text-[#b45309]">⚠</span>
        <p className="text-[12px] text-[#92400e] text-left">
          <strong>Don&apos;t close or refresh this page</strong> — we&apos;re finalizing your application.
        </p>
      </div>
    </motion.div>
  );
}

function SuccessScreen({ code }: { code: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6 }}
      className="flex flex-col items-center text-center w-full"
    >
      <motion.div
        className="flex h-20 w-20 items-center justify-center rounded-full bg-[#15803d]"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2, type: "spring", stiffness: 200 }}
      >
        <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </motion.div>

      <h2 className="mt-6 text-[30px] font-extrabold tracking-[-0.03em] text-[#0a0a0a]">
        You&apos;re submitted.
      </h2>
      <p className="mt-3 max-w-sm text-[15px] text-[#52525b]">
        We&apos;re underwriting now. Save this code to check status anytime. Most decisions land in 1 to 3 hours.
      </p>

      <motion.div
        className="mt-8 w-full bg-[#f0fdf4] border border-[#dcfce7] rounded-xl p-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#15803d] mb-2">Application code</p>
        <p className="text-4xl font-mono font-bold tracking-[0.15em] text-[#0a0a0a]">{code}</p>
      </motion.div>

      <motion.div
        className="mt-8 flex flex-col items-center gap-3 sm:flex-row w-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <Link
          href={`/status/${code}`}
          className="w-full inline-flex items-center justify-center rounded-xl bg-[#15803d] px-5 min-h-[52px] py-3 text-center text-[15px] font-semibold text-white transition-all hover:bg-[#166534] shadow-[0_6px_16px_-8px_rgba(21,128,61,0.5)]"
        >
          Check status &rarr;
        </Link>
        <Link
          href="/"
          className="w-full inline-flex items-center justify-center rounded-xl border-2 border-[#0a0a0a] bg-white px-5 min-h-[52px] py-3 text-center text-[14px] font-semibold text-[#0a0a0a] transition-all hover:bg-[#fafaf7]"
        >
          Back to home
        </Link>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN PAGE                                                           */
/* ------------------------------------------------------------------ */
export default function ApplyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#fafaf7]" />}>
      <ApplyPageInner />
    </Suspense>
  );
}

function attributionFromSearch(searchParams: URLSearchParams) {
  const get = (k: string) => searchParams.get(k) || undefined;
  // Prefer explicit query-string overrides (set by referrer landing pages),
  // otherwise fall back to the live browser values so the URL the applicant
  // actually came from is always captured.
  const landingFromBrowser =
    typeof window !== "undefined" ? window.location.href : undefined;
  const referrerFromBrowser =
    typeof document !== "undefined" && document.referrer ? document.referrer : undefined;
  return {
    utmSource: get("utm_source"),
    utmCampaign: get("utm_campaign"),
    utmMedium: get("utm_medium"),
    utmTerm: get("utm_term"),
    utmContent: get("utm_content"),
    gclid: get("gclid"),
    gbraid: get("gbraid"),
    wbraid: get("wbraid"),
    fbclid: get("fbclid"),
    ttclid: get("ttclid"),
    msclkid: get("msclkid"),
    landingPage: get("lp_path") || landingFromBrowser,
    referrer: get("ref") || referrerFromBrowser,
  };
}

function readPennyClickIdFromCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(/(?:^| )_pl_clickid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

// sessionStorage key for funnel state — used to survive Plaid OAuth bounces
// (Chase, Capital One, etc. redirect the user to the bank's OAuth page and
// back, which wipes React state). We snapshot every state change here and
// rehydrate on mount when ?oauth_state_id is on the URL.
const FUNNEL_STATE_KEY = "pennylime_apply_state";

type PersistedState = {
  step: number;
  loanAmount: number;
  loanTermMonths: number;
  form: InfoForm;
  platforms: string[];
  otherPlatform: string;
  weeklyEarnings: string;
  workerType: string;
  workStartMonth: number;
  workStartYear: number;
};

function readPersistedFunnelState(): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FUNNEL_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function ApplyPageInner() {
  const searchParams = useSearchParams();
  // If the URL has an OAuth return marker, hydrate from sessionStorage on mount.
  const oauthReturning =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("oauth_state_id");
  const persisted = oauthReturning ? readPersistedFunnelState() : null;

  const [step, setStep] = useState(persisted?.step ?? 0);
  const [loanAmount, setLoanAmount] = useState(() => {
    if (persisted) return persisted.loanAmount;
    const a = Number(searchParams.get("amount"));
    return a && a >= 500 && a <= 10000 ? a : 5000;
  });
  const [loanTermMonths, setLoanTermMonths] = useState(() => {
    if (persisted) return persisted.loanTermMonths;
    const t = Number(searchParams.get("term"));
    return t && [1, 2, 3, 4, 6, 8, 12, 16].includes(t) ? t : 4;
  });
  const [form, setForm] = useState<InfoForm>(persisted?.form ?? {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dob: "",
    addressStreet: "",
    addressCity: "",
    addressState: "",
    addressZip: "",
  });
  const [platforms, setPlatforms] = useState<string[]>(() => {
    if (persisted) return persisted.platforms;
    const p = searchParams.get("platform");
    if (p === "Uber") return ["uber"];
    if (p === "Lyft") return ["lyft"];
    if (p === "Both") return ["uber", "lyft"];
    return [];
  });
  const [otherPlatform, setOtherPlatform] = useState(persisted?.otherPlatform ?? "");
  const [weeklyEarnings, setWeeklyEarnings] = useState(persisted?.weeklyEarnings ?? "");
  const [workerType, setWorkerType] = useState(persisted?.workerType ?? "INDEPENDENT_CONTRACTOR");
  const [workStartMonth, setWorkStartMonth] = useState(() => persisted?.workStartMonth ?? new Date().getMonth() + 1);
  const [workStartYear, setWorkStartYear] = useState(() => persisted?.workStartYear ?? new Date().getFullYear());
  const [plaidAccessToken, setPlaidAccessToken] = useState<string | null>(null);
  const [plaidAccountId, setPlaidAccountId] = useState<string | null>(null);
  const [plaidItemId, setPlaidItemId] = useState<string | null>(null);
  const [identityResult, setIdentityResult] = useState<{ needsReview: boolean; matchedName: string | null } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [applicationCode, setApplicationCode] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [templateSteps, setTemplateSteps] = useState<FormStep[] | null>(null);
  const [customStepData, setCustomStepData] = useState<Record<string, string>>({});
  const [pendingPhoneVerification, setPendingPhoneVerification] = useState<{ contactId: string; nextStep: number } | null>(null);

  // Snapshot funnel state to sessionStorage on every change so we can survive
  // a Plaid OAuth bounce (Chase, Capital One, etc. send the user out of the
  // app and back, wiping all React state). Restored on mount when
  // ?oauth_state_id is on the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        FUNNEL_STATE_KEY,
        JSON.stringify({
          step,
          loanAmount,
          loanTermMonths,
          form,
          platforms,
          otherPlatform,
          weeklyEarnings,
          workerType,
          workStartMonth,
          workStartYear,
        }),
      );
    } catch {}
  }, [
    step,
    loanAmount,
    loanTermMonths,
    form,
    platforms,
    otherPlatform,
    weeklyEarnings,
    workerType,
    workStartMonth,
    workStartYear,
  ]);

  useEffect(() => {
    const templateSlug = searchParams.get("template");
    if (templateSlug) {
      fetch(`/api/form-template?slug=${templateSlug}`)
        .then(r => r.json())
        .then(t => {
          if (t?.steps) {
            const steps = JSON.parse(t.steps) as FormStep[];
            setTemplateSteps(steps.filter(s => s.enabled).sort((a, b) => a.order - b.order));
          }
        })
        .catch(() => {});
    }
  }, [searchParams]);

  const activeStepNames = templateSteps
    ? templateSteps.map(s => s.title)
    : STEPS;

  const validateStep2 = () => {
    const parsed = formSchema.safeParse({
      ...form,
      loanAmount,
    });
    const fieldErrors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key && key !== "loanAmount") fieldErrors[String(key)] = issue.message;
      }
    }

    // Validate DOB
    if (!form.dob || !/^\d{4}-\d{2}-\d{2}$/.test(form.dob)) {
      fieldErrors.dob = "Enter a valid date of birth";
    } else {
      const year = parseInt(form.dob.slice(0, 4), 10);
      if (year < 1900 || year > 2010) fieldErrors.dob = "Year must be between 1900 and 2010";
    }

    // Validate address fields
    if (!form.addressStreet || form.addressStreet.trim().length < 3) {
      fieldErrors.addressStreet = "Enter your street address";
    }
    if (!form.addressCity || form.addressCity.trim().length < 2) {
      fieldErrors.addressCity = "Enter your city";
    }
    if (!form.addressState || !US_STATE_CODES.includes(form.addressState)) {
      fieldErrors.addressState = "Select a valid state";
    }
    if (!form.addressZip || !/^\d{5}$/.test(form.addressZip)) {
      fieldErrors.addressZip = "Enter a valid 5-digit ZIP";
    }

    setErrors(fieldErrors);
    return Object.keys(fieldErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!plaidAccessToken || !plaidItemId) {
      toast.error("Please link your bank account before submitting");
      return;
    }

    setSubmitting(true);

    try {
      const result = await submitApplication({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        loanAmount,
        loanTermMonths,
        platform: platforms.join(", "),
        plaidAccessToken,
        plaidItemId,
        plaidAccountId: plaidAccountId ?? undefined,
        identityNeedsReview: identityResult?.needsReview ?? true,
        plaidIdentityName: identityResult?.matchedName ?? undefined,
        workerType,
        workStartMonth,
        workStartYear,
        addressStreet: form.addressStreet,
        addressCity: form.addressCity,
        addressState: form.addressState,
        addressZip: form.addressZip,
        dateOfBirth: form.dob,
      });

      if (result.error) throw new Error(result.error);
      // Stash the application code, then show the verifying screen first.
      // VerifyingScreen calls onDone after its progress bar completes, which
      // unsets `verifying` and the SuccessScreen takes over (it renders when
      // applicationCode is non-null and verifying is false).
      if (result.applicationCode) {
        setApplicationCode(result.applicationCode);
        setVerifying(true);
      }
      if (result.applicationId) {
        try { if (form.email) await linkContactApplication(form.email, result.applicationId); } catch {}
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafaf7]">
      <Navbar />

      <div className="flex min-h-[calc(100vh-64px)] md:min-h-[calc(100vh-80px)] pt-[64px] md:pt-[80px]">
        {/* Left: Form */}
        <div className="flex-1 flex flex-col justify-center px-5 md:px-16 py-8 md:py-12 min-w-0">
          <div className="w-full max-w-xl mx-auto">
            {!applicationCode && (
              <StepIndicator current={step} stepNames={activeStepNames} />
            )}

            {pendingPhoneVerification && (
              <div className="mb-6">
                <PhoneVerification
                  phone={form.phone}
                  contactId={pendingPhoneVerification.contactId}
                  onVerified={() => {
                    const next = pendingPhoneVerification.nextStep;
                    setPendingPhoneVerification(null);
                    setStep(next);
                  }}
                />
              </div>
            )}

            <AnimatePresence mode="wait">
              {applicationCode && verifying ? (
                <VerifyingScreen key="verifying" onDone={() => setVerifying(false)} />
              ) : applicationCode ? (
                <SuccessScreen key="success" code={applicationCode} />
              ) : pendingPhoneVerification ? (
                <div key="verify-placeholder" />
              ) : templateSteps ? (
                (() => {
                  const currentTemplateStep = templateSteps[step];
                  if (!currentTemplateStep) return null;

                  if (currentTemplateStep.type === "custom") {
                    return (
                      <DynamicStep
                        key={`custom-${step}`}
                        title={currentTemplateStep.title}
                        description={currentTemplateStep.description}
                        fields={currentTemplateStep.customFields || []}
                        values={customStepData}
                        onChange={(fieldId, value) => setCustomStepData(prev => ({ ...prev, [fieldId]: value }))}
                        onNext={() => setStep(step + 1)}
                        onBack={() => setStep(step - 1)}
                      />
                    );
                  }

                  // builtin step, map builtinKey to component
                  const builtinKey = currentTemplateStep.builtinKey;
                  if (builtinKey === "amount") {
                    return (
                      <StepAmount
                        key="amount"
                        amount={loanAmount}
                        setAmount={setLoanAmount}
                        loanTermMonths={loanTermMonths}
                        setLoanTermMonths={setLoanTermMonths}
                        onNext={() => setStep(step + 1)}
                      />
                    );
                  }
                  if (builtinKey === "info") {
                    return (
                      <StepInfo
                        key="info"
                        form={form}
                        setForm={setForm}
                        errors={errors}
                        onNext={async () => {
                          if (validateStep2()) {
                            try {
                              const contact = await upsertContact({
                                email: form.email,
                                firstName: form.firstName,
                                lastName: form.lastName,
                                phone: form.phone,
                                source: searchParams.get("utm_campaign") ? `lp:${searchParams.get("utm_campaign")}` : "direct",
                                ...attributionFromSearch(searchParams as unknown as URLSearchParams),
                                pennyClickId: readPennyClickIdFromCookie(),
                                lastAppStep: 2,
                                loanAmountIntent: loanAmount,
                              });
                              await logActivity({ contactId: contact.id, type: "app_started", title: "Application started" });
                              try { sessionStorage.setItem("pennylime_contact_id", contact.id); } catch {}
                              setPendingPhoneVerification({ contactId: contact.id, nextStep: step + 1 });
                              return;
                            } catch {}
                            setStep(step + 1);
                          }
                        }}
                        onBack={() => setStep(step - 1)}
                      />
                    );
                  }
                  if (builtinKey === "platforms") {
                    return (
                      <StepPlatforms
                        key="platforms"
                        platforms={platforms}
                        setPlatforms={setPlatforms}
                        otherPlatform={otherPlatform}
                        setOtherPlatform={setOtherPlatform}
                        weeklyEarnings={weeklyEarnings}
                        setWeeklyEarnings={setWeeklyEarnings}
                        workerType={workerType}
                        setWorkerType={setWorkerType}
                        workStartMonth={workStartMonth}
                        setWorkStartMonth={setWorkStartMonth}
                        workStartYear={workStartYear}
                        setWorkStartYear={setWorkStartYear}
                        onNext={async () => { try { if (form.email) await updateContactLastStep(form.email, step + 1); } catch {} setStep(step + 1); }}
                        onBack={() => setStep(step - 1)}
                      />
                    );
                  }
                  if (builtinKey === "bank") {
                    return (
                      <StepPlaidLink
                        key="plaid"
                        plaidAccessToken={plaidAccessToken}
                        plaidAccountId={plaidAccountId}
                        plaidItemId={plaidItemId}
                        setPlaidData={({ accessToken, accountId, itemId }) => {
                          setPlaidAccessToken(accessToken);
                          setPlaidAccountId(accountId);
                          setPlaidItemId(itemId);
                        }}
                        onNext={async () => { try { if (form.email) await updateContactLastStep(form.email, step + 1); } catch {} setStep(step + 1); }}
                        onBack={() => setStep(step - 1)}
                      />
                    );
                  }
                  if (builtinKey === "verified") {
                    return (
                      <StepVerified
                        key="verified"
                        plaidAccessToken={plaidAccessToken}
                        firstName={form.firstName}
                        lastName={form.lastName}
                        identityResult={identityResult}
                        setIdentityResult={setIdentityResult}
                        onNext={async () => { try { if (form.email) await updateContactLastStep(form.email, step + 1); } catch {} setStep(step + 1); }}
                        onBack={() => setStep(step - 1)}
                      />
                    );
                  }
                  if (builtinKey === "review") {
                    return (
                      <StepReview
                        key="review"
                        amount={loanAmount}
                        loanTermMonths={loanTermMonths}
                        form={form}
                        platforms={platforms}
                        otherPlatform={otherPlatform}
                        weeklyEarnings={weeklyEarnings}
                        bankLinked={!!(plaidAccessToken && plaidAccountId && plaidItemId)}
                        identityNeedsReview={identityResult?.needsReview ?? true}
                        submitting={submitting}
                        onBack={() => setStep(step - 1)}
                        onSubmit={handleSubmit}
                      />
                    );
                  }
                  return null;
                })()
              ) : step === 0 ? (
                <StepAmount
                  key="amount"
                  amount={loanAmount}
                  setAmount={setLoanAmount}
                  loanTermMonths={loanTermMonths}
                  setLoanTermMonths={setLoanTermMonths}
                  onNext={() => setStep(1)}
                />
              ) : step === 1 ? (
                <StepWorkerType
                  key="worker-type"
                  workerType={workerType}
                  setWorkerType={setWorkerType}
                  setPlatforms={setPlatforms}
                  setOtherPlatform={setOtherPlatform}
                  onNext={() => setStep(2)}
                  onBack={() => setStep(0)}
                />
              ) : step === 2 ? (
                <StepInfo
                  key="info"
                  form={form}
                  setForm={setForm}
                  errors={errors}
                  onNext={async () => {
                    if (validateStep2()) {
                      try {
                        const contact = await upsertContact({
                          email: form.email,
                          firstName: form.firstName,
                          lastName: form.lastName,
                          phone: form.phone,
                          source: searchParams.get("utm_campaign") ? `lp:${searchParams.get("utm_campaign")}` : "direct",
                          ...attributionFromSearch(searchParams as unknown as URLSearchParams),
                          pennyClickId: readPennyClickIdFromCookie(),
                          lastAppStep: 3,
                          loanAmountIntent: loanAmount,
                        });
                        await logActivity({ contactId: contact.id, type: "app_started", title: "Application started" });
                        try { sessionStorage.setItem("pennylime_contact_id", contact.id); } catch {}
                        setPendingPhoneVerification({ contactId: contact.id, nextStep: 3 });
                        return;
                      } catch {}
                      setStep(3);
                    }
                  }}
                  onBack={() => setStep(1)}
                />
              ) : step === 3 ? (
                <StepPlatforms
                  key="platforms"
                  platforms={platforms}
                  setPlatforms={setPlatforms}
                  otherPlatform={otherPlatform}
                  setOtherPlatform={setOtherPlatform}
                  weeklyEarnings={weeklyEarnings}
                  setWeeklyEarnings={setWeeklyEarnings}
                  workerType={workerType}
                  setWorkerType={setWorkerType}
                  workStartMonth={workStartMonth}
                  setWorkStartMonth={setWorkStartMonth}
                  workStartYear={workStartYear}
                  setWorkStartYear={setWorkStartYear}
                  onNext={async () => { try { if (form.email) await updateContactLastStep(form.email, 4); } catch {} setStep(4); }}
                  onBack={() => setStep(2)}
                />
              ) : step === 4 ? (
                <StepPlaidLink
                  key="plaid"
                  plaidAccessToken={plaidAccessToken}
                  plaidAccountId={plaidAccountId}
                  plaidItemId={plaidItemId}
                  setPlaidData={({ accessToken, accountId, itemId }) => {
                    setPlaidAccessToken(accessToken);
                    setPlaidAccountId(accountId);
                    setPlaidItemId(itemId);
                  }}
                  onNext={async () => { try { if (form.email) await updateContactLastStep(form.email, 5); } catch {} setStep(5); }}
                  onBack={() => setStep(3)}
                />
              ) : step === 5 ? (
                <StepVerified
                  key="verified"
                  plaidAccessToken={plaidAccessToken}
                  firstName={form.firstName}
                  lastName={form.lastName}
                  identityResult={identityResult}
                  setIdentityResult={setIdentityResult}
                  onNext={async () => { try { if (form.email) await updateContactLastStep(form.email, 6); } catch {} setStep(6); }}
                  onBack={() => setStep(4)}
                />
              ) : (
                <StepReview
                  key="review"
                  amount={loanAmount}
                  loanTermMonths={loanTermMonths}
                  form={form}
                  platforms={platforms}
                  otherPlatform={otherPlatform}
                  weeklyEarnings={weeklyEarnings}
                  bankLinked={!!(plaidAccessToken && plaidAccountId && plaidItemId)}
                  identityNeedsReview={identityResult?.needsReview ?? true}
                  submitting={submitting}
                  onBack={() => setStep(5)}
                  onSubmit={handleSubmit}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Branded sidebar */}
        {!applicationCode && (
          <div className="hidden lg:flex w-[420px] flex-shrink-0 bg-gradient-to-br from-[#15803d] to-[#166534] flex-col justify-center px-10 py-12 text-white relative overflow-hidden">
            {/* Decorative circles */}
            <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute top-1/2 right-8 h-32 w-32 rounded-full bg-white/5" />

            {/* Logo mark */}
            <div className="mb-10">
              <span className="font-extrabold text-[18px] tracking-[-0.03em] text-white">
                Penny<span className="text-[#a3e635]">Lime<span className="text-[#a3e635]">.</span></span>
              </span>
            </div>

            <SidebarContent step={step} amount={loanAmount} loanTermMonths={loanTermMonths} />

            {/* Bottom trust line */}
            <div className="mt-10 pt-6 border-t border-white/20">
              <p className="text-[12px] text-white/50">
                Trusted by 1,200+ drivers, sellers, and operators. Average time to funded: 31 hours.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
