export const metadata = {
  title: "Lending Disclosures | PennyLime",
};

export default function DisclosuresPage() {
  return (
    <div className="max-w-[680px] mx-auto py-16 px-6">
      <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-8">
        Lending Disclosures
      </h1>
      <div className="space-y-6">
        <p className="text-[15px] text-[#71717a] leading-relaxed">Last updated: March 2026</p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          Loan Terms
        </h2>
        <ul className="text-[15px] text-[#71717a] leading-relaxed space-y-2 list-disc pl-5">
          <li><strong className="text-[#1a1a1a]">Loan amounts:</strong> $100 - $10,000</li>
          <li><strong className="text-[#1a1a1a]">Loan terms:</strong> 3 - 18 months</li>
          <li><strong className="text-[#1a1a1a]">APR range:</strong> 30% - 60% (varies by risk profile)</li>
          <li><strong className="text-[#1a1a1a]">Late fee:</strong> $25 per missed payment (after 3-day grace period)</li>
        </ul>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          Example Loan
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          A $5,000 loan at 36% APR over 12 months would have approximate monthly payments of $504.03 and total repayment of $6,048.36.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          How Interest is Calculated
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          Interest is calculated using standard amortization. Each monthly payment consists of principal and interest. Early payments are interest-heavy, while later payments pay down more principal.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          Late Payments
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          If a scheduled payment fails, we will retry daily. A $25 late fee is applied after a 3-day grace period. Accounts 30+ days overdue may be sent to collections.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          Prepayment
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          You may pay off your loan early at any time without prepayment penalties.
        </p>
      </div>
    </div>
  );
}
