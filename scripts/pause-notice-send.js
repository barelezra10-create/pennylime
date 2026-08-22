// One-off: notify all PENDING applicants of the approval pause until Jul 8.
const { Client } = require("pg");
require("dotenv").config();

const FROM = process.env.RESEND_FROM_EMAIL;
const KEY = process.env.RESEND_API_KEY;
const REPLY_TO = "info@pennylime.com";
const APP_URL = process.env.APP_URL || "https://pennylime.com";
const SUPPORT_EMAIL = "info@pennylime.com";

function wrap(inner, preheader) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="x-apple-disable-message-reformatting"><title>PennyLime</title></head>
<body style="margin:0;padding:0;background-color:#f8f8f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f8f8f6;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">
<tr><td style="padding:0 8px 20px 8px;"><a href="${APP_URL}" style="text-decoration:none;color:#1a1a1a;font-size:20px;font-weight:800;letter-spacing:-0.5px;">Penny<span style="color:#15803d;">Lime</span></a></td></tr>
<tr><td style="background-color:#ffffff;border:1px solid #e4e4e7;border-radius:14px;padding:32px;">${inner}</td></tr>
<tr><td style="padding:24px 8px 8px 8px;text-align:center;color:#a1a1aa;font-size:12px;line-height:1.6;">
<p style="margin:0 0 8px 0;">Need help? <a href="mailto:${SUPPORT_EMAIL}" style="color:#15803d;text-decoration:none;">${SUPPORT_EMAIL}</a></p>
<p style="margin:0 0 8px 0;">PennyLime is a service of 770 Technology LLC. Cash advance product. Not a loan.</p>
<p style="margin:0;color:#d4d4d8;font-size:11px;">You're getting this because you have an active application with PennyLime.</p>
</td></tr></table></td></tr></table></body></html>`;
}

function inner(firstName) {
  const p = "margin:0 0 14px;font-size:15px;line-height:1.6;";
  return `<h2 style="margin:0 0 16px;font-size:22px;color:#15803d;">A short delay on your application</h2>
<p style="${p}">Hi ${firstName},</p>
<p style="${p}">We want to be straight with you. We're temporarily <strong>not approving new advances while we fix a technical issue on our side.</strong> Your application hasn't been declined, it's simply on hold until we're back up.</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;">What this means for you:</p>
<ul style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.6;">
<li style="margin-bottom:6px;">We expect to be <strong>back online July 8</strong>, and your application is <strong>first in line</strong> to be reviewed that day.</li>
<li>If you still need the advance, approved funds would reach your bank as soon as <strong>July 9</strong>.</li>
</ul>
<p style="${p}">You don't need to do anything. We've saved everything, and we'll email you the moment there's a decision. Questions in the meantime? Just reply here and a real person will help.</p>
<p style="margin:18px 0 0;font-size:15px;line-height:1.6;">Thanks for your patience, and sorry for the wait.<br>The PennyLime Team</p>`;
}

const SUBJECT = "Your PennyLime application: a short delay";
const PREHEADER = "We've paused new approvals while we fix a technical issue. Your application is first in line on July 8.";

(async () => {
  if (!KEY || !FROM) { console.error("Missing RESEND env"); process.exit(1); }
  const c = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000 });
  await c.connect();
  const apps = await c.query(
    `select distinct on (lower(email)) email, "firstName" from "Application"
     where status = 'PENDING' order by lower(email), "createdAt" desc`
  );
  console.log(`Sending pause notice to ${apps.rows.length} PENDING applicants...`);
  let ok = 0, fail = 0;
  for (const a of apps.rows) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM, to: a.email, reply_to: REPLY_TO,
          subject: SUBJECT, html: wrap(inner(a.firstName || "there"), PREHEADER),
        }),
      });
      const j = await res.json();
      if (res.ok) {
        ok++;
        console.log(`  OK  ${a.email} (${a.firstName}) id=${j.id}`);
        const ct = await c.query(`select id from "Contact" where lower(email)=lower($1) limit 1`, [a.email]);
        if (ct.rows[0]) {
          await c.query(`insert into "EmailEvent"(id,"contactId",type,subject,"messageId","createdAt") values (gen_random_uuid(),$1,'sent',$2,$3,now())`, [ct.rows[0].id, SUBJECT, j.id]).catch(()=>{});
          await c.query(`insert into "Activity"(id,"contactId",type,title,details,"performedBy","createdAt") values (gen_random_uuid(),$1,'email_sent',$2,'Template: pause-notice','system',now())`, [ct.rows[0].id, `Email sent: ${SUBJECT}`]).catch(()=>{});
        }
      } else {
        fail++;
        console.log(`  FAIL ${a.email}: ${JSON.stringify(j)}`);
      }
    } catch (e) {
      fail++;
      console.log(`  ERR ${a.email}: ${e.message}`);
    }
  }
  console.log(`\nDone. sent=${ok} failed=${fail}`);
  await c.end();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
