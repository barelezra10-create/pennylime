import "server-only";

import { renderHtmlToPdf } from "@/lib/pdf/agreement-pdf";
import { renderDisclosureHtml, DISCLOSURE_CSS, type DisclosureInputs } from "./disclosure-template";

/**
 * Renders the CFDL disclosure to a printable PDF. The HTML is identical
 * to what we showed the merchant on-screen, plus a signature block at
 * the bottom that records their typed name, IP, agent, and scroll-to-end
 * acknowledgement. The PDF is saved as a Document on the application
 * for retention (5+ years per state law).
 */
export async function generateCfdlDisclosurePdf(input: DisclosureInputs & {
  signedName: string;
  signedAt: string;
  signedIp: string | null;
  signedUserAgent: string | null;
  scrolledToBottom: boolean;
}): Promise<Buffer> {
  const body = renderDisclosureHtml(input);
  const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
  @page { size: Letter; margin: 0.75in 0.75in 1in 0.75in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { color: #0a0a0a; }
  .signature-block {
    margin-top: 36px;
    padding: 16px 20px;
    border: 2px solid #15803d;
    border-radius: 10px;
    background: #f0fdf4;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 10pt;
    page-break-inside: avoid;
  }
  .signature-block h3 {
    color: #15803d;
    font-size: 12pt;
    font-weight: 700;
    margin: 0 0 10px;
    letter-spacing: -0.01em;
  }
  .signature-block .signed-name {
    font-family: "Caveat", "Helvetica", cursive;
    font-size: 22pt;
    color: #15803d;
    margin: 8px 0 12px;
  }
  .signature-block .meta-line {
    font-size: 9pt;
    color: #52525b;
    margin: 2px 0;
    font-variant-numeric: tabular-nums;
  }
  ${DISCLOSURE_CSS}
</style></head>
<body>
${body}

<div class="signature-block">
  <h3>Merchant acknowledgement and signature</h3>
  <p>By the typed signature below, the merchant acknowledges receiving and reviewing the disclosures above before signing the Receivables Purchase Agreement.</p>
  <div class="signed-name">${input.signedName}</div>
  <div class="meta-line"><strong>Signed:</strong> ${new Date(input.signedAt).toLocaleString("en-US", { timeZoneName: "short" })}</div>
  <div class="meta-line"><strong>IP address:</strong> ${input.signedIp || "(not recorded)"}</div>
  <div class="meta-line"><strong>Browser:</strong> ${input.signedUserAgent ? input.signedUserAgent.slice(0, 120) : "(not recorded)"}</div>
  <div class="meta-line"><strong>Scrolled to end of disclosure:</strong> ${input.scrolledToBottom ? "Yes" : "No"}</div>
</div>

</body></html>`;
  return renderHtmlToPdf(html);
}
