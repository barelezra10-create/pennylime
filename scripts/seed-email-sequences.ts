import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "") });

/* ------------------------------------------------------------------ */
/*  EMAIL LAYOUT WRAPPER                                              */
/* ------------------------------------------------------------------ */
// Inlined-style HTML (Gmail/Outlook strip CSS classes, so styles live on
// each tag). PennyLime brand: green accent #15803d, neutral greys, white
// card on a soft beige page background.
function wrap(innerHtml: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#fafaf7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#fafaf7;">
    <tr><td align="center" style="padding:40px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <tr><td style="background-color:#15803d;padding:24px 32px;">
          <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.02em;">PennyLime.</span>
        </td></tr>
        <tr><td style="padding:32px;color:#0a0a0a;font-size:15px;line-height:1.6;">
          ${innerHtml}
        </td></tr>
        <tr><td style="background-color:#fafafa;padding:24px 32px;border-top:1px solid #e4e4e7;color:#71717a;font-size:12px;line-height:1.5;">
          <p style="margin:0 0 8px 0;font-weight:600;color:#52525b;">PennyLime &mdash; operated by 770 Technology LLC</p>
          <p style="margin:0 0 8px 0;">A Florida limited liability company. Cash advances for gig workers and self-employed earners. This is a merchant cash advance, not a loan.</p>
          <p style="margin:0 0 8px 0;">Questions? Reply to this email or write to <a href="mailto:notifications@pennylime.com" style="color:#15803d;text-decoration:underline;">notifications@pennylime.com</a>.</p>
          <p style="margin:0;color:#a1a1aa;font-size:11px;">You received this because you started or completed a PennyLime application. <a href="https://pennylime.com/unsubscribe?email={email}" style="color:#a1a1aa;text-decoration:underline;">Unsubscribe</a>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const ctaButton = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#15803d;color:#ffffff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:-0.01em;">${label}</a>`;

const h1 = (text: string) =>
  `<h1 style="margin:0 0 16px 0;font-size:24px;font-weight:800;letter-spacing:-0.02em;color:#0a0a0a;line-height:1.25;">${text}</h1>`;

/* ------------------------------------------------------------------ */
/*  SEQUENCES                                                         */
/* ------------------------------------------------------------------ */
const SEQUENCES = [
  /* ── 1. Abandoned application recovery ─────────────────── */
  {
    name: "Abandoned App Recovery",
    description: "Three-email recovery flow for applicants who started but didn't finish (1h, 24h, 7d).",
    triggerType: "abandoned_app",
    triggerValue: null as string | null,
    active: true,
    steps: [
      {
        id: "ab-1",
        order: 0,
        subject: "{firstName}, your ${loanAmount} advance is waiting",
        body: wrap(`
          ${h1("You were 60 seconds away.")}
          <p>Hey {firstName} &mdash; you started a <strong>$\{loanAmount}</strong> cash advance with PennyLime but stopped before finishing.</p>
          <p>The good news: <strong>your spot is still held.</strong> Picking up where you left off takes about a minute. We just need to verify your bank deposits and you're done.</p>
          <p style="margin:24px 0;">${ctaButton("https://pennylime.com/apply", "Finish my application →")}</p>
          <p style="color:#71717a;font-size:13px;">No credit check. No paperwork. Just your platform deposits.</p>
        `),
        delayAmount: 1,
        delayUnit: "hours",
      },
      {
        id: "ab-2",
        order: 1,
        subject: "Still need that $\{loanAmount}, {firstName}?",
        body: wrap(`
          ${h1("Don't let this slip away.")}
          <p>{firstName}, your <strong>$\{loanAmount}</strong> application is still open but it expires soon.</p>
          <p>Most gig workers who finish get a decision within an hour. We size advances by your actual deposits, so the only thing standing between you and the cash is one minute of bank verification.</p>
          <p style="margin:24px 0;">${ctaButton("https://pennylime.com/apply", "Continue my application →")}</p>
          <p style="color:#71717a;font-size:13px;">PennyLime is built for Uber, Lyft, DoorDash, Instacart, and 10+ other gig platforms. Same-day funding available on most advances.</p>
        `),
        delayAmount: 24,
        delayUnit: "hours",
      },
      {
        id: "ab-3",
        order: 2,
        subject: "Last reminder, {firstName} — your application closes soon",
        body: wrap(`
          ${h1("Closing your application in 24 hours.")}
          <p>{firstName}, this is your final reminder. Incomplete applications are auto-closed after 7 days, so we're about to remove yours.</p>
          <p>If you still need that <strong>$\{loanAmount}</strong>, the link below picks up exactly where you left off &mdash; no need to start over.</p>
          <p style="margin:24px 0;">${ctaButton("https://pennylime.com/apply", "Reopen my application →")}</p>
          <p style="color:#71717a;font-size:13px;">If you applied elsewhere or no longer need the funds, no action needed &mdash; we'll close it automatically.</p>
        `),
        delayAmount: 6,
        delayUnit: "days",
      },
    ],
  },

  /* ── 2. Application submitted — pending review ─────────── */
  {
    name: "Application Submitted",
    description: "Confirmation sent immediately after submit. Sets expectations on review timing.",
    triggerType: "stage_change",
    triggerValue: "APPLICANT",
    active: true,
    steps: [
      {
        id: "sub-1",
        order: 0,
        subject: "Got it, {firstName} — your application is in review",
        body: wrap(`
          ${h1("Thanks, {firstName}. We're on it.")}
          <p>Your application for <strong>$\{loanAmount}</strong> is now in review. Reference number <strong style="color:#15803d;font-family:'SF Mono','Monaco','Courier New',monospace;letter-spacing:0.05em;">#{applicationCode}</strong>.</p>
          <p>What happens next:</p>
          <ol style="padding-left:20px;margin:0 0 20px 0;">
            <li style="margin-bottom:8px;">We verify your bank deposits and identity (~1 hour, automated).</li>
            <li style="margin-bottom:8px;">We size your approved advance based on your verified earnings.</li>
            <li>You get an email with your offer to accept (or a clear no, with the reason).</li>
          </ol>
          <p>Most decisions land within a few hours during business hours. If you applied overnight, expect a reply by mid-morning ET.</p>
          <p style="color:#71717a;font-size:13px;margin-top:24px;">No further action needed from you right now. Hold tight — we'll be in touch.</p>
        `),
        delayAmount: 0,
        delayUnit: "hours",
      },
    ],
  },

  /* ── 3. Application APPROVED — pick your offer ─────────── */
  {
    name: "Application Approved",
    description: "Sent when admin sets offer terms / status moves to APPROVED. Includes the offer link.",
    triggerType: "stage_change",
    triggerValue: "APPROVED",
    active: true,
    steps: [
      {
        id: "appr-1",
        order: 0,
        subject: "{firstName}, you're approved! Choose your advance ↓",
        body: wrap(`
          ${h1("You're approved, {firstName}.")}
          <p>Good news. Based on your verified deposits, PennyLime can advance you <strong>up to $\{maxAmount}</strong>. The offer below lets you dial in the exact amount and pick how you'd like to repay.</p>
          <p style="margin:24px 0;">${ctaButton("{offerLink}", "Choose my offer →")}</p>
          <p style="background:#f0fdf4;border:1px solid #dcfce7;border-radius:8px;padding:14px 16px;margin:24px 0;color:#15803d;font-size:14px;">
            <strong>Reference:</strong> #{applicationCode}<br>
            <strong>Approved range:</strong> $\{minAmount} &mdash; $\{maxAmount}
          </p>
          <p>Once you accept, ACH disbursement starts immediately. Funds typically land in your linked bank account within 1 business day.</p>
          <p style="color:#71717a;font-size:13px;margin-top:24px;">This offer is valid for 7 days. Questions before you accept? Just reply to this email.</p>
        `),
        delayAmount: 0,
        delayUnit: "hours",
      },
    ],
  },

  /* ── 4. Application DECLINED ────────────────────────────── */
  {
    name: "Application Declined",
    description: "Sent when status moves to REJECTED. Polite decline with re-apply window.",
    triggerType: "stage_change",
    triggerValue: "REJECTED",
    active: true,
    steps: [
      {
        id: "rej-1",
        order: 0,
        subject: "Update on your PennyLime application",
        body: wrap(`
          ${h1("We can't approve this one, {firstName}.")}
          <p>Thanks for applying for <strong>$\{loanAmount}</strong> with PennyLime. After reviewing your verified deposits, we're unable to extend you an advance at this time.</p>
          <p>Common reasons we decline:</p>
          <ul style="padding-left:20px;margin:0 0 20px 0;color:#52525b;">
            <li style="margin-bottom:6px;">Insufficient verified deposit history (need at least 30 days).</li>
            <li style="margin-bottom:6px;">Cash flow doesn't cover the advance plus weekly remittance comfortably.</li>
            <li style="margin-bottom:6px;">Identity or bank verification couldn't be completed.</li>
          </ul>
          <p>This is not a credit decision &mdash; it has no impact on your credit score.</p>
          <p>You're welcome to apply again in <strong>60 days</strong>. By then your bank will likely show more deposit history, which usually changes the answer.</p>
          <p style="color:#71717a;font-size:13px;margin-top:24px;">Reference: #{applicationCode}. If you believe this was a mistake or want to discuss, reply to this email and we'll take a closer look.</p>
        `),
        delayAmount: 0,
        delayUnit: "hours",
      },
    ],
  },

  /* ── 5. Loan funded — celebration ───────────────────────── */
  {
    name: "Loan Funded",
    description: "Sent when status moves to FUNDED (after applicant accepts offer + ACH credit fires).",
    triggerType: "stage_change",
    triggerValue: "FUNDED",
    active: true,
    steps: [
      {
        id: "fund-1",
        order: 0,
        subject: "Funded! $\{loanAmount} is on the way, {firstName}",
        body: wrap(`
          ${h1("Cash is on the way, {firstName}.")}
          <p>Your <strong>$\{loanAmount}</strong> advance has been disbursed via ACH to the bank account you linked. Most banks post the credit within 1 business day; some do same-day.</p>
          <p>Reference: <strong style="color:#15803d;font-family:'SF Mono','Monaco','Courier New',monospace;letter-spacing:0.05em;">#{applicationCode}</strong></p>
          <p>From here, weekly remittances will run automatically every 7 days from the same bank account, on the schedule you accepted. We'll email a reminder before each one.</p>
          <p>Keep earning, keep growing. Thanks for choosing PennyLime.</p>
          <p style="color:#71717a;font-size:13px;margin-top:24px;">Need to update your bank or pause a payment? Reply to this email and our team will help.</p>
        `),
        delayAmount: 0,
        delayUnit: "hours",
      },
    ],
  },

  /* ── 6. Re-engagement (manual, off by default) ─────────── */
  {
    name: "Re-engagement",
    description: "Manual win-back flow for cold contacts. Disabled by default — admin enrolls manually.",
    triggerType: "manual",
    triggerValue: null as string | null,
    active: false,
    steps: [
      {
        id: "re-1",
        order: 0,
        subject: "We miss you, {firstName}",
        body: wrap(`
          ${h1("Still earning, still on the road?")}
          <p>{firstName}, it's been a minute. PennyLime is still here whenever you need a cash advance against your platform earnings &mdash; $500 to $10,000, no credit check.</p>
          <p style="margin:24px 0;">${ctaButton("https://pennylime.com/apply", "Apply again →")}</p>
        `),
        delayAmount: 0,
        delayUnit: "hours",
      },
      {
        id: "re-2",
        order: 1,
        subject: "{firstName}, returning customer rates inside",
        body: wrap(`
          ${h1("A better rate, on us.")}
          <p>As a returning applicant, you may qualify for reduced fees on your next advance. The form remembers your details, so it's a one-minute reapply.</p>
          <p style="margin:24px 0;">${ctaButton("https://pennylime.com/apply", "Check my rate →")}</p>
        `),
        delayAmount: 15,
        delayUnit: "days",
      },
    ],
  },
];

async function main() {
  console.log("Seeding email sequences...");

  for (const seq of SEQUENCES) {
    const existing = await prisma.emailSequence.findFirst({ where: { name: seq.name } });
    if (existing) {
      // Upsert-in-place: refresh fields so seed file is the source of truth
      // for system sequences, while preserving the row's id (and therefore
      // any existing SequenceEnrollment rows pointing at it).
      await prisma.emailSequence.update({
        where: { id: existing.id },
        data: {
          description: seq.description,
          triggerType: seq.triggerType,
          triggerValue: seq.triggerValue,
          active: seq.active,
          steps: JSON.stringify(seq.steps),
        },
      });
      console.log(`  Updated: ${seq.name}`);
    } else {
      await prisma.emailSequence.create({
        data: {
          name: seq.name,
          description: seq.description,
          triggerType: seq.triggerType,
          triggerValue: seq.triggerValue,
          active: seq.active,
          steps: JSON.stringify(seq.steps),
        },
      });
      console.log(`  Created: ${seq.name}`);
    }
  }

  console.log("Done.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
