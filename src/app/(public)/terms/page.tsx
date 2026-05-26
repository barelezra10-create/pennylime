export const metadata = {
  title: "Terms of Service",
  alternates: { canonical: "https://pennylime.com/terms" },
};

export default function TermsPage() {
  return (
    <div className="max-w-[680px] mx-auto py-12 md:py-16 px-5 md:px-6">
      <h1 className="text-[26px] md:text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-8">
        Terms of Service
      </h1>
      <div className="space-y-6">
        <p className="text-[15px] text-[#71717a] leading-relaxed">Last updated: April 2026</p>

        <p className="text-[15px] text-[#71717a] leading-relaxed">
          PennyLime is owned and operated by 770 Technology LLC, a Florida limited liability company (EIN 42-2071573), with principal place of business at 1300 Monad Terrace, Unit 9B, Miami Beach, FL 33139.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          1. Acceptance of Terms
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          By accessing and using PennyLime, you agree to be bound by these Terms of Service.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          2. The PennyLime Product
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          PennyLime offers <strong className="text-black">merchant cash advances</strong> to qualifying
          gig workers, 1099 contractors, and small businesses. A merchant cash advance is the purchase
          by PennyLime of a specified dollar amount of your future receivables at a discount, in exchange
          for a lump-sum payment to you. <strong className="text-black">This is a cash advance product, not a credit product.</strong>{" "}
          There is no Annual Percentage Rate (APR) or interest rate; the cost is expressed as a factor rate
          and is fully disclosed before you accept the advance. Advance amounts range from $500 to $10,000
          and are repaid through a daily or weekly remittance of a fixed percentage of your future
          receivables.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          3. Eligibility
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          To apply for an advance, you must be at least 18 years old, a U.S. resident, operate as a
          gig worker, 1099 contractor, sole proprietor, or owner of a small business, and have a
          verifiable bank account where your business or platform earnings are deposited. Approval
          is subject to our underwriting review of your verified earnings and existing financial
          obligations.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          4. Disclosures Before You Accept
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          Before any advance is funded, PennyLime will provide you with a written agreement disclosing the
          purchase amount (the cash you receive), the purchased receivables amount (the total you will
          repay), the factor rate, the specified percentage of receivables to be remitted, the expected
          remittance schedule, and any fees. You may review and decline the offer at no cost prior to
          acceptance.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          5. Repayment
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          Repayment is collected via daily or weekly ACH debit from your linked bank account, in an
          amount equal to the agreed specified percentage of your future receivables until the
          purchased receivables amount has been delivered. Failed remittances may incur fees as set
          forth in the advance agreement and as permitted by applicable law. Failure to remit may
          result in collection actions consistent with the agreement and applicable law.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          6. No Guarantee of Approval
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          Submission of an application does not guarantee approval or funding. PennyLime reserves the
          right to decline any application for any reason permitted by law.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          7. Privacy
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          Your personal information is handled in accordance with our{" "}
          <a href="/privacy" className="text-[#15803d] hover:underline">
            Privacy Policy
          </a>
          {" "}and our{" "}
          <a href="/security/data-retention" className="text-[#15803d] hover:underline">
            Data Retention and Disposal Policy
          </a>
          .
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          8. Contact
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          For questions about these terms, contact us at{" "}
          <a href="mailto:info@pennylime.com" className="text-[#15803d] hover:underline">
            info@pennylime.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
