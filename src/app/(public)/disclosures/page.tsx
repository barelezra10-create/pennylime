export const metadata = {
  title: "Disclosures",
  alternates: { canonical: "https://pennylime.com/disclosures" },
};

export default function DisclosuresPage() {
  return (
    <div className="max-w-[680px] mx-auto py-12 md:py-16 px-5 md:px-6">
      <h1 className="text-[26px] md:text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-8">
        Disclosures
      </h1>
      <div className="space-y-6">
        <p className="text-[15px] text-[#71717a] leading-relaxed">Last updated: May 2026</p>

        <p className="text-[15px] text-[#71717a] leading-relaxed">
          PennyLime is owned and operated by 770 Technology LLC, a Florida limited liability company (EIN 42-2071573), with principal place of business at 1300 Monad Terrace, Unit 9B, Miami Beach, FL 33139.
          PennyLime offers <strong className="text-[#1a1a1a]">merchant cash advances</strong> to qualifying drivers, sellers, and operators.
          A merchant cash advance is the purchase of a portion of your future receivables at a discount,
          in exchange for a lump sum today. <strong className="text-[#1a1a1a]">This is a cash advance product, not a credit product.</strong>
          There is no Annual Percentage Rate (APR) or interest rate.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          Advance Terms
        </h2>
        <ul className="text-[15px] text-[#71717a] leading-relaxed space-y-2 list-disc pl-5">
          <li><strong className="text-[#1a1a1a]">Advance amount:</strong> $500 to $10,000</li>
          <li><strong className="text-[#1a1a1a]">Factor rate:</strong> typically 1.20 to 1.49 (varies by risk profile)</li>
          <li><strong className="text-[#1a1a1a]">Origination fee:</strong> a one-time fee disclosed in your written agreement before you accept</li>
          <li><strong className="text-[#1a1a1a]">Repayment:</strong> a fixed percentage of your future bank deposits, debited daily or weekly via ACH</li>
          <li><strong className="text-[#1a1a1a]">Failed-debit fee:</strong> as permitted by your state and disclosed in the advance agreement</li>
        </ul>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          Example Advance
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          A $5,000 advance at a 1.30 factor rate would deliver $5,000 to your bank account in exchange for the right to collect $6,500 in purchased receivables. At an example 7% remittance of daily deposits and average daily deposits of $200, repayment would complete in approximately 24 business days. Total cost of capital: $1,500.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          How Cost is Calculated
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          PennyLime advances are not credit products, so there is no APR. Cost is expressed as a factor rate plus a one-time origination fee. The factor rate multiplies the advance amount to produce the total purchased receivables amount. Total cost is fully disclosed in dollar terms before you accept the advance.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          Failed Remittances
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          If a scheduled ACH remittance fails, we will retry within NACHA limits and reach out to update your payment information. Hardship accommodations are available before delinquency, including modified remittance percentages or short pause periods. Accounts that remain delinquent may be referred to a third-party collections partner that operates in compliance with the FDCPA, the CFPB&apos;s Regulation F, and applicable state laws.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          Early Payoff
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          You may pay off the remaining purchased receivables amount in full at any time without penalty.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          State Commercial Financing Disclosures
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          Merchants in California, New York, Utah, Virginia, and Georgia receive an additional written Commercial Financing Disclosure required by state law (NY Financial Services Law §§ 800-815, CA Financial Code §§ 22800 et seq., Utah Commercial Financing Registration and Disclosure Act, VA Commercial Financing Disclosure Act, GA Commercial Financing Disclosure Law). The disclosure includes the disbursed amount, finance charge, total payment, estimated APR-equivalent, repayment schedule, specified percentage, prepayment policy, and a statement that the transaction is unsecured.
        </p>
        <p className="text-[15px] text-[#71717a] leading-relaxed mt-3">
          The disclosure is displayed on the offer page and must be reviewed in full and signed by the merchant (typed-name signature with IP and timestamp captured) before the Receivables Purchase Agreement can be accepted. Each signed disclosure is retained as a PDF in the merchant's account and is available on request from <a href="mailto:info@pennylime.com" className="text-[#15803d] hover:underline">info@pennylime.com</a>.
        </p>
      </div>
    </div>
  );
}
