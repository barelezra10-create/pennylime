export const metadata = {
  title: "Privacy Policy | PennyLime",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-[680px] mx-auto py-16 px-6">
      <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-8">
        Privacy Policy
      </h1>
      <div className="space-y-6">
        <p className="text-[15px] text-[#71717a] leading-relaxed">Last updated: March 2026</p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          1. Information We Collect
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          We collect: personal information (name, email, phone, SSN), financial information (income, bank account details via Plaid), and uploaded documents (pay stubs, identification).
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          2. How We Use Your Information
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          Your information is used to: process your loan application, verify your identity and income, determine loan eligibility and terms, collect loan payments, and communicate with you about your account.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          3. Data Security
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          Sensitive data including SSN and bank credentials are encrypted at rest using AES-256 encryption. We use Plaid for secure bank connections, your banking credentials are never stored on our servers.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          4. Third-Party Services
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          We use Plaid for bank account verification and income data. Plaid&apos;s privacy practices are governed by their own privacy policy.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          5. Data Retention
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          We retain your data for as long as your loan is active plus 7 years for regulatory compliance.
        </p>

        <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mt-10">
          6. Your Rights
        </h2>
        <p className="text-[15px] text-[#71717a] leading-relaxed">
          You may request access to or deletion of your personal data by contacting us at{" "}
          <a href="mailto:privacy@pennylime.com" className="text-[#15803d] hover:underline">
            privacy@pennylime.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
