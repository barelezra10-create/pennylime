export const metadata = {
  title: "Privacy Policy | PennyLime",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-[680px] mx-auto py-12 md:py-16 px-5 md:px-6">
      <h1 className="text-[26px] md:text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-8">
        Privacy Policy
      </h1>
      <div className="space-y-6">
        <p className="text-[15px] text-[#71717a] leading-relaxed">Last updated: April 2026</p>

        <p className="text-[15px] text-[#71717a] leading-relaxed">
          PennyLime is owned and operated by 770 Technology Way LLC, a Florida limited liability company.
          PennyLime offers <strong className="text-black">merchant cash advances</strong> to qualifying gig workers,
          1099 contractors, and small businesses; we do not extend credit.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          1. Information We Collect
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          We collect personal information (name, email, phone, SSN or EIN), business and financial information (verified earnings and bank account data via Plaid), and uploaded documents (government ID, business records).
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          2. How We Use Your Information
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          Your information is used to process your application for a merchant cash advance, verify your identity and earnings, determine eligibility and pricing, disburse approved advances and collect remittances, monitor advance performance, and communicate with you about your account.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          3. Data Security
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          Sensitive data including SSN, bank-account identifiers, and Plaid access tokens is encrypted at rest using AES-256 and in transit using TLS 1.2 or higher. We use Plaid for secure bank connections; your banking credentials are never shared with or stored by PennyLime. Our full security program is described in our <a href="/security" className="text-[#15803d] hover:underline">Information Security Policy</a>.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          4. Third-Party Services
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          We use Plaid for bank account verification, identity matching, and earnings analysis. Plaid&apos;s privacy practices are governed by Plaid&apos;s own privacy policy. We use Twilio for SMS verification and customer communication, and standard cloud-infrastructure providers for hosting (Railway, Cloudflare).
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          5. Data Retention
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          Application records and funded-advance records are retained for 7 years from final decision or close of advance to satisfy state recordkeeping and tax requirements. Identity and KYC documentation is retained for 5 years from the end of the customer relationship under the Bank Secrecy Act. Plaid access tokens are revoked and removed within 30 days of relationship end. Full retention windows are set out in our <a href="/security/data-retention" className="text-[#15803d] hover:underline">Data Retention and Disposal Policy</a>.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          6. Your Rights
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          California, Colorado, Connecticut, Virginia, and other state-privacy-law residents may request access to, correction of, or deletion of their personal information by contacting us at{" "}
          <a href="mailto:privacy@pennylime.com" className="text-[#15803d] hover:underline">privacy@pennylime.com</a>. We respond within 45 days, extendable to 90 days where reasonably necessary. Where a deletion request conflicts with a regulatory retention obligation, the regulated data is retained for the required period and the rest is deleted.
        </p>
      </div>
    </div>
  );
}
