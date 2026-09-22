# Toll-free verification: +18886912706

Business: PennyLime / 770 Technology LLC.
Rejection received September 18, 2026; resubmit before September 25 to remain within the email's seven-day priority window.

## Changes prepared

- Application phone verification offers “Continue without SMS verification” in both the send-code and enter-code screens. Skipping advances the application without sending a text or marking the phone verified.
- Ongoing account/payment SMS consent remains a separate, unchecked, optional checkbox. Copy explicitly says applicants can apply and receive service without texts.
- Neither verification provider changes ongoing SMS consent when a code is verified.
- New funnel contacts explicitly start with SMS consent false; a database migration also changes the default for other new contacts.
- SMS terms describe the optional verification path.

## Release and evidence

Deploy the application changes and apply migration `20260922120000_optional_sms_consent` before resubmitting. The working tree contains unrelated pre-existing changes; release only the intended reviewed changes.

Existing contact preferences are preserved. Historical true values may have come from the old default or phone verification, so they cannot automatically be treated as proof of explicit consent. Audit against available consent records before relying on them for ongoing messages.

On the live application, capture screenshots of the optional verification screen and the separate unchecked consent checkbox. Show that the applicant can continue with no verification text and no ongoing SMS consent. Use publicly accessible evidence URLs. Do not use an admin preview that bypasses the verification screen.

## Proposed submission explanation (after live verification)

SMS consent is optional. Applicants can select “Continue without SMS verification” and continue their application without requesting a verification text. Ongoing account and payment messages require a separate SMS consent checkbox, unchecked by default. Requesting or entering a verification code does not enroll the applicant in ongoing messages. Consent is not required to apply or receive service. The disclosure identifies PennyLime (770 Technology LLC), describes message types and frequency, and includes rates, STOP/HELP instructions, SMS Terms, and Privacy Policy links.

Opt-in workflow: https://pennylime.com/apply
SMS terms: https://pennylime.com/sms-terms
Evidence screenshots: [insert publicly accessible URLs after deployment]

No Twilio submission has been sent as part of preparing these changes.
