/**
 * NACHA ACH return reason codes. Maps the cryptic R-codes that come
 * back on a returned ACH debit to a short, human-readable explanation
 * so admins (and the borrower, if surfaced) can tell at a glance why
 * the debit didn't go through.
 *
 * The full NACHA list has 70+ codes; this covers every code we have
 * actually seen + everything common enough to matter. Unknown codes
 * fall back to "Returned (<code>)".
 */

const CODES: Record<string, string> = {
  // NSF / funds
  R01: "Insufficient funds",
  R09: "Uncollected funds",

  // Account problems
  R02: "Account closed",
  R03: "No account found / unable to locate",
  R04: "Invalid account number",
  R08: "Payment stopped by customer",
  R10: "Customer revoked authorization",
  R11: "Check truncation entry return",
  R12: "Account sold to another institution",
  R14: "Representative payee deceased / unable to continue",
  R15: "Beneficiary deceased",
  R16: "Account frozen",
  R20: "Non-transaction account (e.g., savings restrictions)",
  R23: "Credit refused by receiver",
  R29: "Corporate customer advises not authorized",

  // Format / data problems
  R05: "Unauthorized debit to consumer account",
  R06: "Returned per ODFI request",
  R07: "Authorization revoked",
  R13: "Invalid routing number",
  R17: "File record edit criteria failure",
  R18: "Improper effective entry date",
  R19: "Amount field error",
  R21: "Invalid company identification",
  R22: "Invalid individual ID",
  R24: "Duplicate entry",
  R25: "Addenda error",
  R26: "Mandatory field error",
  R27: "Trace number error",
  R28: "Routing check digit error",
  R31: "Permissible return entry",
  R32: "RDFI non-settlement",
  R33: "Return of XCK entry",
  R34: "Limited participation DFI",
  R35: "Return of improper debit entry",
  R36: "Return of improper credit entry",
  R37: "Source document presented for payment",
  R38: "Stop payment on source document",
  R39: "Improper source document",

  // RTP rejections
  rtp_account_closed: "Account closed (RTP)",
  rtp_account_blocked: "Account blocked (RTP)",
  rtp_invalid_credit_account: "Invalid account (RTP)",
  rtp_invalid_creditor_account_type: "Account type not supported (RTP)",
  rtp_other: "Rejected by destination bank (RTP)",
};

export function explainReturnCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  if (CODES[upper]) return `${CODES[upper]} (${upper})`;
  if (CODES[code]) return `${CODES[code]} (${code})`;
  return `Returned (${code})`;
}
