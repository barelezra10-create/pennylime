export const metadata = {
  title: "Access Controls Policy | PennyLime",
  description: "PennyLime's Access Controls Policy — provisioning, authentication, RBAC, access reviews, and de-provisioning.",
  alternates: { canonical: "https://pennylime.com/security/access-controls" },
};

export default function AccessControlsPage() {
  return (
    <div className="max-w-[760px] mx-auto py-12 md:py-16 px-5 md:px-6">
      <h1 className="text-[26px] md:text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-2">
        Access Controls Policy
      </h1>
      <p className="text-[13px] text-[#71717a] mb-1">
        Owner: Head of Information Security · Bar Elezra · security@pennylime.com
      </p>
      <p className="text-[13px] text-[#71717a] mb-1">Effective date: April 1, 2026 · Last reviewed: April 29, 2026</p>
      <p className="text-[13px] text-[#71717a] mb-1">Review cadence: Annual, or upon material change.</p>
      <p className="text-[13px] text-[#71717a] mb-4">
        Supplements the{" "}
        <a href="/security" className="text-[#15803d] hover:underline">PennyLime Information Security Policy</a>.
      </p>
      <a
        href="/access-controls-policy.pdf"
        download
        className="inline-flex items-center gap-2 bg-[#15803d] hover:bg-[#166534] text-white text-[13px] font-semibold rounded-lg px-4 py-2 mb-10 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Download PDF
      </a>

      <p className="text-[15px] text-[#52525b] leading-relaxed mb-8">
        This Access Controls Policy establishes the requirements for granting, managing, reviewing, and revoking access to PennyLime information systems, customer data, source code, infrastructure, and physical work environments. It is binding on all personnel, contractors, and service providers, and supplements the parent Information Security Policy.
      </p>

      <S n="1" t="Purpose and Scope">
        This policy applies to every system, application, and dataset that processes, stores, or transmits PennyLime information assets, including production infrastructure (Railway, Cloudflare), source-code repositories (GitHub), administrative consoles, third-party vendor portals (Plaid, Twilio, Google Workspace), and physical or remote work environments used by personnel.
      </S>

      <S n="2" t="Guiding Principles">
        <ul className="list-disc pl-6 space-y-1.5 mt-1">
          <li><strong>Least privilege.</strong> Personnel receive the minimum access required to perform their role.</li>
          <li><strong>Need to know.</strong> Access to Restricted or Confidential data is granted only when a documented business purpose exists.</li>
          <li><strong>Separation of duties.</strong> Sensitive operations require two-person review where feasible.</li>
          <li><strong>Defense in depth.</strong> Authentication, authorization, network controls, and audit logging operate as independent layered controls.</li>
        </ul>
      </S>

      <S n="3" t="Roles and Responsibilities">
        The Head of Information Security owns this policy, approves provisioning of privileged access, conducts quarterly access reviews, and decides exceptions. The Founder is the executive sponsor and backup approver. System owners maintain user lists for systems they own and notify the Head of InfoSec of role changes within one business day. All personnel comply with this policy and report suspected unauthorized access to security@pennylime.com immediately.
      </S>

      <S n="4" t="Account Provisioning">
        Access is provisioned only after the user has acknowledged the Information Security Policy in writing, a documented business need is approved by the Head of InfoSec, and the user has completed required onboarding security training. Each request records date, requester, approver, scope of access, and business justification.
      </S>

      <S n="5" t="Authentication">
        <ul className="list-disc pl-6 space-y-1.5 mt-1">
          <li>Multi-factor authentication is required for all administrative and production-data accounts (Railway, Cloudflare, GitHub, Google Workspace, Plaid, Twilio, the PennyLime admin console).</li>
          <li>Passwords are at least 14 characters with complexity, unique per system, and stored only in an approved password manager. Reuse across systems is prohibited.</li>
          <li>Session timeouts are enforced at 12 hours of inactivity for administrative consoles and 30 minutes for sensitive customer-data views.</li>
          <li>Shared accounts and shared credentials are prohibited. Service accounts, where unavoidable, are individually owned, documented, and rotated quarterly.</li>
        </ul>
      </S>

      <S n="6" t="Authorization and Role-Based Access Control">
        Application-level access is governed by named roles enforced in code: SUPER_ADMIN (full administrative access), ADMIN (operational access excluding system configuration), UNDERWRITER (applications and underwriting decisions), SUPPORT (assigned contacts and outreach), and READ_ONLY/AUDITOR (read-only compliance review). Role assignments are documented and reviewed quarterly; role changes follow the same approval workflow as provisioning.
      </S>

      <S n="7" t="Privileged Access Management">
        Privileged access (production database, infrastructure root, payments processor) is restricted to named individuals listed in the Privileged Access Roster. Privileged actions are logged with actor, timestamp, action, and target. Privileged access is reviewed monthly.
      </S>

      <S n="8" t="Access Reviews">
        The Head of Information Security performs an access review at least quarterly. Each review confirms that every active account is still required, has the correct role, and has MFA enabled. Privileged access is reviewed monthly. Findings are tracked to remediation; out-of-policy access is removed within five business days.
      </S>

      <S n="9" t="Termination and De-provisioning">
        Access is revoked within one business day of separation, role change, contractor end-of-engagement, or any incident requiring immediate revocation. The de-provisioning checklist covers application accounts, source-code access, vendor portals, secrets-store credentials, single-sign-on entitlements, and physical or remote-work resources. Revocation is verified and documented.
      </S>

      <S n="10" t="Remote Access">
        Personnel access production systems exclusively over HTTPS / TLS 1.2+ with MFA. Access from public or untrusted networks requires a hardened personal device with full-disk encryption and current operating-system updates. VPN is used where additional network segregation is required.
      </S>

      <S n="11" t="Third-Party Access">
        Third-party access is granted only with a written agreement that includes confidentiality, security, and breach-notification obligations. Access is time-limited to the engagement and reviewed at least quarterly. Vendors handling Restricted or Confidential data are listed in the Vendor Risk Register maintained by the Head of InfoSec.
      </S>

      <S n="12" t="Audit Logging and Monitoring">
        Authentication events, administrative actions, role changes, privileged actions, and access to Restricted or Confidential customer data are logged with a tamper-resistant audit trail retained for at least 12 months. Logs are reviewed periodically and on trigger events; anomalous patterns (failed logins, after-hours access, bulk data export) trigger investigation.
      </S>

      <S n="13" t="Physical Access">
        PennyLime is a remote-first organization. Production infrastructure is hosted in third-party data centers operated by Railway and Cloudflare; their physical security controls are reviewed annually as part of vendor risk management. Personnel work from secured personal environments using encrypted, password-protected devices.
      </S>

      <S n="14" t="Exceptions">
        Exceptions to this policy are granted only by the Head of Information Security with documented business justification, compensating controls, and an expiration date. Active exceptions are reviewed at each access review.
      </S>

      <S n="15" t="Policy Review and Acknowledgment">
        This policy is reviewed at least annually, or upon material change. Personnel acknowledge this policy at hire and at each annual review.
      </S>

      <div className="mt-12 pt-6 border-t border-[#e4e4e7] text-[12px] text-[#71717a]">
        Questions and access requests: <a href="mailto:security@pennylime.com" className="text-[#15803d] hover:underline">security@pennylime.com</a>. Document version 1.0.
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
