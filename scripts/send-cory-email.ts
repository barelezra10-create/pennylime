// Force the production sender so the email actually delivers — the local
// .env has the dev placeholder for this var.
process.env.RESEND_FROM_EMAIL = "PennyLime <notifications@pennylime.com>";

import { sendEmail } from "../src/lib/emails/send";

const html = `
<p style="margin: 0 0 16px; font-size: 16px; color: #1a1a1a;">Hi Cory,</p>

<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.55; color: #374151;">
  Thanks for applying for a cash advance with <strong>PennyLime</strong>. We're reviewing your
  application now.
</p>

<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.55; color: #374151;">
  To complete underwriting, we need to verify your recent deposits. Could you send us the
  <strong>last 90 days of transactions</strong> from the bank account where you receive your
  gig-platform deposits?
</p>

<p style="margin: 0 0 8px; font-size: 15px; line-height: 1.55; color: #374151;">
  Two easy options — whichever is simpler:
</p>

<ol style="margin: 0 0 16px 20px; padding: 0; font-size: 15px; line-height: 1.7; color: #374151;">
  <li><strong>PDF statements</strong> — log in to your bank's online portal and download the
    last 3 monthly statements as PDFs.</li>
  <li><strong>CSV export</strong> — most banks let you export transactions to CSV from the
    activity / history page. Download the last 90 days.</li>
</ol>

<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.55; color: #374151;">
  Just reply to this email with the files attached. Your statements are encrypted in transit
  and stored only as long as needed to fund and service your advance.
</p>

<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.55; color: #374151;">
  Once we have those, we'll review and get back to you with terms within 24 hours.
</p>

<p style="margin: 0 0 8px; font-size: 15px; color: #374151;">Thanks,</p>
<p style="margin: 0; font-size: 15px; color: #374151;">The PennyLime Team</p>
`;

async function main() {
  const result = await sendEmail({
    to: "coryloomis79@gmail.com",
    subject: "Next step on your PennyLime application — last 90 days of transactions",
    preheader: "Please send us your last 90 days of bank transactions to finish underwriting.",
    html,
  });
  console.log(result);
}

main().catch((e) => { console.error(e); process.exit(1); });
