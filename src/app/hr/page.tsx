import type { Metadata } from "next";
import { HrApplyClient } from "./hr-apply-client";

export const metadata: Metadata = {
  title: "Careers - Underwriter | PennyLime",
  description:
    "Join PennyLime as a Consumer / MCA Underwriter. Own the full credit process, from reviewing applications to approvals and collections. Remote.",
};

export default function CareersPage() {
  return (
    <div className="min-h-screen bg-[#f8f8f6]">
      <header className="border-b border-[#e4e4e7] bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center">
          <span className="text-[16px] font-extrabold tracking-[-0.03em]">
            Penny<span className="text-[#15803d]">Lime</span>
            <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-[#a1a1aa]">Careers</span>
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 items-start">
          {/* Job description */}
          <div>
            <span className="inline-block rounded-full bg-[#f0fdf4] text-[#15803d] text-[11px] font-bold uppercase tracking-wide px-2.5 py-1">
              Remote · Full-time
            </span>
            <h1 className="mt-3 text-[26px] sm:text-[32px] font-extrabold tracking-[-0.03em] text-black">
              Consumer / MCA Underwriter
            </h1>
            <p className="mt-1 text-[15px] text-[#71717a]">Full application lifecycle · Remote (US)</p>

            <div className="mt-6 space-y-6 text-[14px] leading-relaxed text-[#3f3f46]">
              <section>
                <h2 className="text-[15px] font-bold text-black mb-2">The role</h2>
                <p>
                  PennyLime offers personal loans and cash advances to gig-economy and self-employed
                  borrowers. We're looking for an experienced underwriter to own the full credit process:
                  reviewing applications, verifying income and cash flow from bank data, deciding the
                  approval amount, and managing accounts through repayment and collections. You protect our
                  capital while giving good borrowers a fair shot.
                </p>
              </section>

              <section>
                <h2 className="text-[15px] font-bold text-black mb-2">What you'll do</h2>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Review applications end to end: identity, income source, requested amount, use of funds.</li>
                  <li>Analyze bank statements and Plaid data to verify real income, cash flow, and NSF risk.</li>
                  <li>Make the credit decision: approve, decline, or approve at a reduced amount, with a clear reason.</li>
                  <li>Set repayment schedules based on the borrower's real capacity to pay.</li>
                  <li>Monitor the active book and work delinquent or defaulted accounts through resolution.</li>
                  <li>Spot fraud and patterns, and help sharpen our underwriting rules.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-[15px] font-bold text-black mb-2">What we're looking for</h2>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>2+ years of consumer lending, credit, or underwriting experience.</li>
                  <li><strong>MCA / merchant cash advance underwriting is a strong plus.</strong></li>
                  <li>Strong ability to read bank statements and understand cash flow and NSF risk.</li>
                  <li>Comfort making judgment calls on messy data and defending your reasoning.</li>
                  <li>Familiarity with ACH and return codes; experience working delinquent accounts.</li>
                </ul>
              </section>
            </div>
          </div>

          {/* Application form */}
          <div className="lg:sticky lg:top-8">
            <HrApplyClient />
          </div>
        </div>
      </main>
    </div>
  );
}
