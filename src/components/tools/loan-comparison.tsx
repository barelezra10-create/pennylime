"use client";

import Link from "next/link";

const Check = () => (
  <svg className="w-4 h-4 text-[#15803d] inline-block mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const Cross = () => (
  <svg className="w-4 h-4 text-[#ef4444] inline-block mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

interface FeatureRow {
  label: string;
  lime: { value: string; positive: boolean };
  mca: { value: string; positive: boolean };
  bank: { value: string; positive: boolean };
}

const features: FeatureRow[] = [
  {
    label: "APR / Rate",
    lime: { value: "30-60% APR", positive: true },
    mca: { value: "Factor 1.2-1.5x", positive: false },
    bank: { value: "8-36% APR", positive: true },
  },
  {
    label: "Credit Check",
    lime: { value: "No credit check", positive: true },
    mca: { value: "Soft check only", positive: true },
    bank: { value: "Hard pull required", positive: false },
  },
  {
    label: "Funding Speed",
    lime: { value: "48 hours", positive: true },
    mca: { value: "24 hours", positive: true },
    bank: { value: "2-4 weeks", positive: false },
  },
  {
    label: "Loan Range",
    lime: { value: "$100 - $10,000", positive: true },
    mca: { value: "$5,000+", positive: false },
    bank: { value: "$5,000 - $50,000", positive: true },
  },
  {
    label: "Repayment",
    lime: { value: "Monthly fixed", positive: true },
    mca: { value: "Daily debit", positive: false },
    bank: { value: "Monthly fixed", positive: true },
  },
  {
    label: "Gig Workers OK",
    lime: { value: "Yes", positive: true },
    mca: { value: "Business only", positive: false },
    bank: { value: "W-2 preferred", positive: false },
  },
];

export function LoanComparison() {
  return (
    <div className="bg-white rounded-[10px] p-6 md:p-8 border border-[#e4e4e7]">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* PennyLime */}
        <div className="bg-[#f0f5f0] border-2 border-[#15803d] rounded-[10px] p-5">
          <div className="mb-1">
            <span className="text-[10px] uppercase tracking-[0.06em] font-semibold text-[#15803d] bg-[#dcfce7] px-2 py-0.5 rounded-full">
              Recommended
            </span>
          </div>
          <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-[#1a1a1a] mt-2 mb-1">
            PennyLime
          </h3>
          <p className="text-[12px] text-[#71717a]">Built for gig workers</p>
        </div>

        {/* MCA */}
        <div className="bg-[#fafafa] border border-[#e4e4e7] rounded-[10px] p-5">
          <div className="mb-1 h-5" />
          <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-[#1a1a1a] mt-2 mb-1">
            MCA
          </h3>
          <p className="text-[12px] text-[#71717a]">Merchant Cash Advance</p>
        </div>

        {/* Bank */}
        <div className="bg-[#fafafa] border border-[#e4e4e7] rounded-[10px] p-5">
          <div className="mb-1 h-5" />
          <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-[#1a1a1a] mt-2 mb-1">
            Traditional Bank
          </h3>
          <p className="text-[12px] text-[#71717a]">Personal / business loan</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#f4f4f5]">
              <th className="text-left py-2 pr-4 text-[11px] uppercase tracking-[0.05em] text-[#71717a] font-medium w-1/4">
                Feature
              </th>
              <th className="py-2 px-4 text-center text-[11px] uppercase tracking-[0.05em] text-[#15803d] font-semibold w-1/4">
                PennyLime
              </th>
              <th className="py-2 px-4 text-center text-[11px] uppercase tracking-[0.05em] text-[#71717a] font-medium w-1/4">
                MCA
              </th>
              <th className="py-2 pl-4 text-center text-[11px] uppercase tracking-[0.05em] text-[#71717a] font-medium w-1/4">
                Bank
              </th>
            </tr>
          </thead>
          <tbody>
            {features.map((row) => (
              <tr key={row.label} className="border-b border-[#f4f4f5] last:border-0">
                <td className="py-3 pr-4 text-[#71717a] font-medium">{row.label}</td>
                <td className="py-3 px-4 text-center bg-[#f0f5f0]/40">
                  {row.lime.positive ? <Check /> : <Cross />}
                  <span className={row.lime.positive ? "text-[#1a1a1a]" : "text-[#71717a]"}>
                    {row.lime.value}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  {row.mca.positive ? <Check /> : <Cross />}
                  <span className={row.mca.positive ? "text-[#1a1a1a]" : "text-[#71717a]"}>
                    {row.mca.value}
                  </span>
                </td>
                <td className="py-3 pl-4 text-center">
                  {row.bank.positive ? <Check /> : <Cross />}
                  <span className={row.bank.positive ? "text-[#1a1a1a]" : "text-[#71717a]"}>
                    {row.bank.value}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-center">
        <Link
          href="/apply"
          className="inline-block bg-[#15803d] text-white text-[13px] font-medium px-8 py-3 rounded-lg hover:bg-[#166534] transition-colors"
        >
          Apply with PennyLime, No Credit Check
        </Link>
      </div>
    </div>
  );
}
