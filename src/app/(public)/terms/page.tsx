export const metadata = {
  title: "Terms of Service | PennyLime",
};

export default function TermsPage() {
  return (
    <div className="max-w-[680px] mx-auto py-16 px-6">
      <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-8">
        Terms of Service
      </h1>
      <div className="space-y-6">
        <p className="text-[15px] text-[#71717a] leading-relaxed">Last updated: March 2026</p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          1. Acceptance of Terms
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          By accessing and using PennyLime, you agree to be bound by these Terms of Service.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          2. Loan Products
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          We offer personal loans ranging from $100 to $10,000 with terms up to 18 months. Interest rates are determined based on your risk profile and may vary. All loan terms, including APR and repayment schedule, will be disclosed before you accept the loan.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          3. Eligibility
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          To apply for a loan, you must be at least 18 years old, a U.S. resident, and have a valid bank account. Approval is subject to income verification and our underwriting criteria.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          4. Repayment
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          Loan repayments are collected via ACH debit from your linked bank account on a monthly schedule. Late payments may incur fees. Failure to repay may result in collection actions.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          5. Privacy
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          Your personal information is handled in accordance with our{" "}
          <a href="/privacy" className="text-[#15803d] hover:underline">
            Privacy Policy
          </a>
          .
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          6. Contact
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          For questions about these terms, contact us at{" "}
          <a href="mailto:support@pennylime.com" className="text-[#15803d] hover:underline">
            support@pennylime.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
