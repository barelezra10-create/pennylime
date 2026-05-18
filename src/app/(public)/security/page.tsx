export const metadata = {
  title: "Information Security Policy | PennyLime",
  description: "PennyLime's Information Security Policy — how we protect customer data, manage access, encrypt information, and respond to incidents.",
};

export default function SecurityPage() {
  return (
    <div className="max-w-[760px] mx-auto py-12 md:py-16 px-5 md:px-6">
      <h1 className="text-[26px] md:text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-2">
        Information Security Policy
      </h1>
      <p className="text-[13px] text-[#71717a] mb-1">
        Owner: Head of Information Security · Bar Elezra · security@pennylime.com
      </p>
      <p className="text-[13px] text-[#71717a] mb-1">Effective date: April 1, 2026 · Last reviewed: April 29, 2026</p>
      <p className="text-[13px] text-[#71717a] mb-4">Review cadence: Annual, or upon material change to the business or technology stack.</p>
      <a
        href="/information-security-policy.pdf"
        download
        className="inline-flex items-center gap-2 bg-[#15803d] hover:bg-[#166534] text-white text-[13px] font-semibold rounded-lg px-4 py-2 mb-10 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Download PDF (signed)
      </a>

      <p className="text-[15px] text-[#52525b] leading-relaxed mb-10">
        PennyLime, operated by 770 Technology LLC, a Florida limited liability company, maintains this Information Security Policy to govern the confidentiality, integrity, and availability of information assets entrusted to us by merchant applicants, customers, employees, partners, and regulators. This policy is binding on all personnel, contractors, and service providers acting on behalf of PennyLime.
      </p>

      <Section n="1" title="Scope">
        This policy covers all information assets owned, processed, or controlled by PennyLime, including production systems, customer data, employee records, source code, third-party integrations (Plaid, Twilio, Railway, Cloudflare, Google Workspace, payment processors), and physical and remote work environments used by personnel.
      </Section>

      <Section n="2" title="Governance and Roles">
        The Head of Information Security is the policy owner and is accountable for security strategy, policy, and incident response. The Founder serves as the executive sponsor. All personnel are responsible for following this policy and reporting suspected security events. Vendors and contractors are bound by written agreements that include confidentiality and security requirements.
      </Section>

      <Section n="3" title="Data Classification and Handling">
        Information is classified into four levels:
        <ul className="list-disc pl-6 mt-2 space-y-1.5">
          <li><strong>Restricted</strong> – Social Security numbers, government IDs, encrypted bank credentials, payment authorization data, full transaction histories.</li>
          <li><strong>Confidential</strong> – Personally identifiable information (PII) including names, addresses, phone numbers, dates of birth, employer information, and consumer-report data.</li>
          <li><strong>Internal</strong> – Business records, source code, internal documentation, vendor contracts.</li>
          <li><strong>Public</strong> – Marketing content, published policies, public website material.</li>
        </ul>
        Handling, retention, and destruction requirements scale to the classification level. Restricted and Confidential data are encrypted at rest and in transit, access-logged, and retained only for the advance lifecycle plus regulatory retention windows, after which data is securely destroyed.
      </Section>

      <Section n="4" title="Access Control and Authentication">
        Access to production systems, customer data, and administrative tools follows the principle of least privilege. All administrative accounts require multi-factor authentication. Access is granted upon documented business need, reviewed at least quarterly, and revoked within one business day of role change or separation. Shared credentials are prohibited. Production database access is logged and audited.
      </Section>

      <Section n="5" title="Encryption Standards">
        Restricted and Confidential data are encrypted at rest using AES-256 and in transit using TLS 1.2 or higher. Cryptographic keys and secrets are stored in a managed secrets store (Railway environment variables and equivalent), rotated upon personnel change, and never embedded in source code. Sensitive fields stored in our application database (e.g., SSN, Plaid access tokens) are individually encrypted with application-layer keys.
      </Section>

      <Section n="6" title="Network and System Security">
        Production infrastructure runs on hardened, reputable cloud providers (Railway, Cloudflare). Public services are served exclusively over HTTPS. Web application firewalling, rate limiting, and bot mitigation are provided by Cloudflare. Application code is reviewed before deployment. Dependencies are continuously monitored for known vulnerabilities and patched on a defined cadence.
      </Section>

      <Section n="7" title="Vendor and Third-Party Risk Management">
        All service providers handling Restricted or Confidential data are reviewed for security posture before engagement and are bound by written agreements requiring confidentiality, breach notification, and applicable regulatory compliance (GLBA, FCRA, BSA/AML, FDCPA, NACHA, PCI-DSS where applicable). Material vendors are reviewed at least annually. The current set of in-scope vendors includes Plaid (account data and verification), Twilio (SMS), Railway (compute and database), Cloudflare (network and DNS), and Google Workspace (email).
      </Section>

      <Section n="8" title="Personnel Security and Training">
        Personnel with access to Restricted or Confidential data acknowledge this policy in writing and complete security awareness training at onboarding and at least annually thereafter. Training covers phishing, credential hygiene, data handling, incident reporting, and applicable regulatory obligations. Background checks are conducted for personnel with access to Restricted data, where lawful.
      </Section>

      <Section n="9" title="Secure Software Development">
        Code is version-controlled in Git with branch protection. Production deploys go through automated build and dependency checks. Secrets are never committed to source control. Material schema or security-impacting changes are reviewed by the policy owner before release.
      </Section>

      <Section n="10" title="Incident Response">
        PennyLime maintains a documented Incident Response Plan covering detection, triage, containment, eradication, recovery, and post-incident review. Suspected security events are reported to security@pennylime.com. Incidents involving customer data are triaged within 24 hours and material incidents are reported to affected parties and regulators within applicable statutory timelines. Post-incident reviews produce written remediation plans owned by the Head of Information Security.
      </Section>

      <Section n="11" title="Business Continuity and Disaster Recovery">
        Production data is replicated and backed up by our infrastructure providers. Recovery objectives are reviewed at least annually. Critical operational runbooks are maintained for service interruption, vendor outage, and data loss scenarios.
      </Section>

      <Section n="12" title="Privacy and Regulatory Compliance">
        PennyLime complies with the Gramm-Leach-Bliley Act (GLBA) Safeguards Rule, the Fair Credit Reporting Act (FCRA) and Regulation V where consumer-report data is used, the Bank Secrecy Act (BSA) and AML obligations including OFAC and PEP screening, the Fair Debt Collection Practices Act (FDCPA) and Regulation F for any collections activity, NACHA Operating Rules for ACH transactions, and applicable state privacy and consumer protection laws including the CCPA/CPRA for California residents.
      </Section>

      <Section n="13" title="Audit, Monitoring, and Logging">
        Authentication events, administrative actions, and material data access are logged. Logs are retained for at least one year and reviewed periodically and upon trigger events. Security exceptions and policy deviations are documented and tracked to remediation.
      </Section>

      <Section n="14" title="Policy Review and Acknowledgment">
        This policy is reviewed annually, or sooner upon material change to the business, technology stack, or regulatory environment. Updates are versioned and dated. All personnel acknowledge the current policy at hire and at each annual review.
      </Section>

      <div className="mt-12 pt-6 border-t border-[#e4e4e7] text-[12px] text-[#71717a]">
        Questions, security disclosures, or incident reports may be directed to{" "}
        <a href="mailto:security@pennylime.com" className="text-[#15803d] hover:underline">security@pennylime.com</a>. PennyLime, operated by 770 Technology LLC.
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-[18px] font-extrabold tracking-[-0.02em] text-[#1a1a1a] mb-2">
        {n}. {title}
      </h2>
      <div className="text-[14px] text-[#52525b] leading-relaxed">{children}</div>
    </section>
  );
}
