// Branded shell applied to every transactional email. Use email-safe HTML
// (tables, inline styles, no flexbox) so it renders consistently across
// Gmail, Apple Mail, Outlook, etc.

const APP_URL = process.env.APP_URL || "https://pennylime.com";
const SUPPORT_EMAIL = "info@pennylime.com";

export function wrapTransactionalEmail(innerHtml: string, preheader?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<title>PennyLime</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f8f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f8f8f6;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding:0 8px 20px 8px;">
            <a href="${APP_URL}" style="text-decoration:none;color:#1a1a1a;font-size:20px;font-weight:800;letter-spacing:-0.5px;">
              Penny<span style="color:#15803d;">Lime</span>
            </a>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background-color:#ffffff;border:1px solid #e4e4e7;border-radius:14px;padding:32px;">
            ${innerHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 8px 8px 8px;text-align:center;color:#a1a1aa;font-size:12px;line-height:1.6;">
            <p style="margin:0 0 8px 0;">
              Need help? <a href="mailto:${SUPPORT_EMAIL}" style="color:#15803d;text-decoration:none;">${SUPPORT_EMAIL}</a>
            </p>
            <p style="margin:0 0 8px 0;">
              PennyLime is a service of 770 Technology LLC. Cash advance product. Not a loan.
            </p>
            <p style="margin:0;color:#d4d4d8;font-size:11px;">
              You're getting this because you have an active application or advance with PennyLime.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
