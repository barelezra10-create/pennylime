export const metadata = {
  title: "Data Retention and Disposal Policy | PennyLime",
  description: "PennyLime's Data Retention and Disposal Policy — retention windows, secure deletion methods, customer rights, and legal holds.",
};

const SCHEDULE = [
  ["Merchant application records (approved or declined): legal name, EIN, contact, application data", "7 years from final decision or close of advance", "BSA recordkeeping; state lending and licensing"],
  ["Identity and KYC documentation: government ID, beneficial-owner records, OFAC screening results", "5 years from termination of customer relationship", "BSA / 31 CFR 1010.430"],
  ["Funded advance records: contracts, receipts, payment schedules, remittance history, payoff records", "7 years from final payment or charge-off", "State commercial finance laws; tax / accounting requirements"],
  ["Plaid access tokens (encrypted)", "Active for the life of the account connection; revoked and removed within 30 days of relationship end or revocation", "GLBA Safeguards Rule; minimum-necessary principle"],
  ["Plaid-derived transaction and balance data used in underwriting", "7 years from final decision or close of advance, retained as part of the application file", "Audit trail for underwriting; ECOA Reg B"],
  ["Adverse action notices and supporting consumer-report data", "25 months from notice date", "ECOA / Regulation B 12 CFR 1002.12(b)"],
  ["Marketing leads (no application started)", "24 months from last interaction; sooner upon opt-out", "CCPA/CPRA; CAN-SPAM"],
  ["Email and SMS communications log", "18 months", "Operational support; CAN-SPAM / TCPA documentation"],
  ["SMS opt-in / opt-out records", "5 years from last consent or revocation event", "TCPA defense; Reg F"],
  ["Audit logs (authentication, admin actions, sensitive data access)", "12 months minimum; 7 years for Restricted-data events or incidents", "Internal audit; incident investigation"],
  ["Tax, accounting, and corporate records", "7 years", "IRS recordkeeping"],
  ["Vendor contracts and security reviews", "Term of contract plus 7 years", "Contract enforcement; vendor risk audit trail"],
  ["Backups", "Rolling 30 days unless covered by a longer requirement above", "Disaster-recovery SLA; minimization"],
];

export default function DataRetentionPage() {
  return (
    <div className="max-w-[820px] mx-auto py-12 md:py-16 px-5 md:px-6">
      <h1 className="text-[26px] md:text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-2">
        Data Retention and Disposal Policy
      </h1>
      <p className="text-[13px] text-[#71717a] mb-1">
        Owner: Head of Information Security · Bar Elezra · security@pennylime.com
      </p>
      <p className="text-[13px] text-[#71717a] mb-1">Effective date: April 1, 2026 · Last reviewed: April 29, 2026</p>
      <p className="text-[13px] text-[#71717a] mb-1">Review cadence: Annual, or upon material change to applicable laws.</p>
      <p className="text-[13px] text-[#71717a] mb-4">
        Supplements the{" "}
        <a href="/security" className="text-[#15803d] hover:underline">PennyLime Information Security Policy</a>.
      </p>
      <a
        href="/data-retention-policy.pdf"
        download
        className="inline-flex items-center gap-2 bg-[#15803d] hover:bg-[#166534] text-white text-[13px] font-semibold rounded-lg px-4 py-2 mb-10 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Download PDF
      </a>

      <p className="text-[15px] text-[#52525b] leading-relaxed mb-8">
        This Data Retention and Disposal Policy defines how long PennyLime retains different categories of information, the legal and regulatory bases for those retention periods, the methods by which data is securely disposed of when retention windows end, and the rights consumers have to request access, correction, or deletion. It supplements the parent Information Security Policy and is binding on all personnel and service providers.
      </p>

      <S n="1" t="Purpose and Scope">
        This policy applies to all PennyLime information assets including merchant applicant data, customer financial data, identity documents, Plaid-derived bank data, payment records, audit logs, marketing communications, and business records. It governs primary production storage, backups, archives, and copies held by service providers.
      </S>

      <S n="2" t="Guiding Principles">
        <ul className="list-disc pl-6 space-y-1.5 mt-1">
          <li><strong>Purpose limitation.</strong> Data is retained only as long as a legitimate operational, legal, regulatory, or contractual purpose exists.</li>
          <li><strong>Minimum necessary.</strong> Where multiple retention windows could apply, the shortest window that satisfies all obligations is used.</li>
          <li><strong>Secure disposal.</strong> When a retention window ends, data is securely destroyed using methods appropriate to the storage medium and the data classification.</li>
          <li><strong>Documented exceptions.</strong> Legal holds, active investigations, and audit-driven extensions are documented and tracked to release.</li>
        </ul>
      </S>

      <S n="3" t="Roles and Responsibilities">
        The Head of Information Security owns this policy, the retention schedule, and the disposal procedures. Personnel are responsible for following the schedule for data they create or access. Service providers handling customer data are bound by written agreements requiring equivalent retention and disposal practices.
      </S>

      <S n="4" t="Retention Schedule">
        <div className="overflow-x-auto -mx-2 mt-2">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-[#fafafa] border-b border-[#e4e4e7]">
                <th className="text-left px-3 py-2 font-semibold">Data Category</th>
                <th className="text-left px-3 py-2 font-semibold">Retention Period</th>
                <th className="text-left px-3 py-2 font-semibold">Basis</th>
              </tr>
            </thead>
            <tbody>
              {SCHEDULE.map(([cat, period, basis], i) => (
                <tr key={i} className="border-b border-[#f4f4f5] align-top">
                  <td className="px-3 py-2.5">{cat}</td>
                  <td className="px-3 py-2.5">{period}</td>
                  <td className="px-3 py-2.5 text-[#71717a]">{basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </S>

      <S n="5" t="Disposal Methods">
        <ul className="list-disc pl-6 space-y-1.5 mt-1">
          <li><strong>Database records.</strong> Hard delete with verification; soft-deleted records are purged within 30 days.</li>
          <li><strong>Encrypted fields with separate keys.</strong> Cryptographic erasure (key destruction) where field-level keys are held independently of underlying storage.</li>
          <li><strong>Files and documents.</strong> Overwritten and deleted from object storage; equivalent secure-delete operations on local working copies.</li>
          <li><strong>Backups.</strong> Rolling 30-day expiry; backup-restoration procedures include re-application of any pending deletions.</li>
          <li><strong>Physical media.</strong> Full-disk encryption keys destroyed and devices securely wiped before reuse, transfer, or disposal.</li>
        </ul>
      </S>

      <S n="6" t="Customer Rights">
        Consumers may request access to, correction of, or deletion of their personal information by contacting <a href="mailto:privacy@pennylime.com" className="text-[#15803d] hover:underline">privacy@pennylime.com</a>. Requests are verified and answered within 45 days, extendable to 90 days where reasonably necessary, in accordance with CCPA/CPRA and other applicable state privacy laws. Where a deletion request conflicts with a regulatory retention obligation (BSA, Reg B records), the regulated data is retained for the required period and the consumer is informed; non-regulated personal information is deleted.
      </S>

      <S n="7" t="Legal Holds">
        Upon notice of pending or anticipated litigation, regulatory inquiry, or government investigation, applicable data is placed under legal hold and excluded from routine disposal until the hold is released by the Head of Information Security or designated counsel. Legal holds are documented with scope, custodians, and release date.
      </S>

      <S n="8" t="Service Provider Data">
        Service providers handling customer data are contractually required to maintain retention and disposal practices substantively equivalent to this policy and to certify destruction or return of customer data upon contract termination. The Vendor Risk Register (maintained by the Head of InfoSec) tracks each provider's deletion commitment.
      </S>

      <S n="9" t="Audit and Verification">
        The Head of Information Security verifies adherence to this policy at least annually. Verification includes sampling of expired records to confirm deletion, review of the disposal log, and confirmation of vendor-side destruction certifications. Findings are tracked to remediation.
      </S>

      <S n="10" t="Policy Review and Acknowledgment">
        This policy is reviewed at least annually, or sooner upon material change to applicable laws or business operations. Personnel acknowledge this policy at hire and at each annual review.
      </S>

      <div className="mt-12 pt-6 border-t border-[#e4e4e7] text-[12px] text-[#71717a]">
        Privacy and deletion requests: <a href="mailto:privacy@pennylime.com" className="text-[#15803d] hover:underline">privacy@pennylime.com</a>. Security inquiries: <a href="mailto:security@pennylime.com" className="text-[#15803d] hover:underline">security@pennylime.com</a>. Document version 1.0.
      </div>
    </div>
  );
}

function S({ n, t, children }: { n: string; t: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-[18px] font-extrabold tracking-[-0.02em] text-[#1a1a1a] mb-2">
        {n}. {t}
      </h2>
      <div className="text-[14px] text-[#52525b] leading-relaxed">{children}</div>
    </section>
  );
}
