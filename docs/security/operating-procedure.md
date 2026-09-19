# PennyLime security control rollout

Owner: CTO / security@pennylime.com. Prepared September 18, 2026.
This is the implementation procedure, not evidence that every control is already operating.

## Access and MFA

Admin authentication combines the existing password with a user-verified WebAuthn passkey/security key. Origin and RP ID derive only from NEXTAUTH_URL. Challenges expire in 5 minutes, are bound to an account, consumed once, and verified server-side. First enrollment requires a trusted-operator-issued random 30-minute code plus the existing password. Enrollment, logins, and issued codes are audited without recording secrets. Enrolled accounts never have a password-only fallback.

1. Apply the additive migration and deploy in enrollment mode (ADMIN_MFA_REQUIRED unset). Old sessions will need a fresh sign-in because new sessions bind to password and MFA version.
2. From a trusted operator shell, run `npx tsx scripts/admin-mfa-enrollment.ts EMAIL PRIVATE_FILE`. Deliver the file's code directly to the verified account holder. Do not email codes or put them into screenshots, tickets, source control, CI artifacts or application logs. Delete the local code file after use.
3. Account holder enters password and enrollment code at /admin/login, then personally completes the platform passkey/security-key prompt. Ensure NEXTAUTH_URL is the canonical HTTPS domain; never enroll production keys under a temporary origin.
4. Verify a fresh passkey login for each authorized user and verify enrollment coverage in /admin/security. Remove obsolete accounts via the existing team process.
5. Set ADMIN_MFA_REQUIRED=true, redeploy and test password-only rejection, legacy-session rejection and a successful passkey login before attesting to MFA. Retain a redacted screenshot showing the passkey prompt and enrollment coverage, with no secrets/customer data.
6. Recovery requires independent identity verification by the security owner, documented approval, version increment to revoke sessions and credential revocation. There is deliberately no self-service password-only reset or backdoor. Maintain a tested account recovery runbook and multiple authorized operators before mandatory rollout.
7. Separately require and verify MFA for Railway, GitHub, Cloudflare, Google Workspace, Plaid and payment processors. Application MFA does not prove those systems' controls.

## Vulnerability management and deadlines

Daily CI dependency audit and repository vulnerability/configuration/secret scanning generate pass/fail evidence. Dependabot opens updates daily. A Node lifecycle check fails within 90 days of end of support. Builds move to Node 22. Failed checks must be reviewed by the owner each business day. CI does not scan employee endpoints or the provider's running host OS.

Proposed operating deadlines, effective once adopted by the owner: actively exploited/critical findings triaged within 1 business day and remediated within 72 hours; high within 7 days; medium within 30 days; low within 90 days. Track first observed date, severity, affected asset, owner, deadline, fix evidence and any time-limited accepted exception. Tests and rollback planning are required for production fixes. Never backdate evidence.

Endpoint prerequisites: inventory every employee/contractor device accessing customer data; enroll devices in managed EDR/vulnerability management; enforce disk encryption, updates and screen lock; verify scan coverage and patch reporting. Inventory cloud production hosts/images and managed-service responsibilities. Do not answer “all devices and production assets scanned” until the inventory and scan evidence cover them.

## Retention and disposal

Daily /api/cron/security-retention is authenticated with CRON_SECRET and scheduled in the companion bot at 05:15 UTC. It records an aggregate audit report and clears expired MFA challenges. With RETENTION_REVOKE_ENABLED unset it is report-only.

An ADMIN reviews each closed application at /admin/security, verifies the actual relationship end date and records legal holds. Never infer the date from updatedAt. Enabling RETENTION_REVOKE_ENABLED=true revokes Plaid access for reviewed closed relationships older than 30 days, unless held or linked to another active relationship. API errors remain retryable; successful revocation clears the application access/user tokens and records an audit event. Historical underwriting reports, agreements, payments and other records are not deleted by this job.

Historical record disposal requires a category-specific inventory, documented lawful retention basis, verified elapsed period, hold review, attachment/contact/vendor/backup coverage and a reviewed disposal manifest. The seven-year reminder is a review date, not an automatic legal determination. Confirm backup lifecycle configuration and deletion re-application on restores. Review and record privacy requests, verify identity, and meet the published response periods. Until these manual procedures and provider settings are evidenced, retention enforcement is only partial.

## Plaid evidence and remaining sign-off

Report actual deployed state, not staged code. Do not submit security attestation until account holders complete enrollment, infrastructure MFA is evidenced, endpoint coverage is verified, scanning is running and triaged, and the security owner has adopted and operates retention and patch procedures. This engineering work does not establish a legal licensing opinion, regulatory audit or general certification of compliance.
