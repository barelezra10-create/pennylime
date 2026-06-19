// Transactional SMS templates. Keep messages tight (target <160 chars / 1 segment)
// and informational. STOP/HELP are handled globally by Twilio infrastructure.
//
// Convention: include a short identifier (app code or payment #) so support
// can find the right record quickly when a borrower replies.

const SHORT_URL = "pennylime.com";

// Compliance footer. Carriers and Twilio toll-free verification expect STOP/HELP
// language on recurring transactional traffic; keep it identical across templates.
const OPT_OUT = "Reply STOP to opt out, HELP for help.";

function statusLine(applicationCode: string): string {
  return `Track: ${SHORT_URL}/status/${applicationCode}`;
}

function money(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function applicationSubmittedSms(p: {
  firstName: string;
  applicationCode: string;
}): string {
  return `PennyLime: Got your application, ${p.firstName}. Code ${p.applicationCode}. We're reviewing now and will text the decision shortly. ${OPT_OUT}`;
}

export function applicationApprovedSms(p: {
  firstName: string;
  applicationCode: string;
  loanAmount: number;
}): string {
  return `PennyLime: Approved, ${p.firstName}. ${money(p.loanAmount)} advance is ready. ${statusLine(p.applicationCode)} ${OPT_OUT}`;
}

export function offerReadySms(p: {
  firstName: string;
  applicationCode: string;
  offerToken: string;
  approvedAmount: number;
}): string {
  // Full token is required - server validates exact match. With the compliance
  // footer this typically runs ~2 GSM-7 segments; acceptable for a one-time offer.
  const url = `${SHORT_URL}/offer/${p.applicationCode}?t=${p.offerToken}`;
  return `PennyLime: Approved ${p.firstName}! ${money(p.approvedAmount)} advance ready. Review & accept: ${url} ${OPT_OUT}`;
}

export function advanceFundedSms(p: {
  firstName: string;
  fundedAmount: number;
  firstDueDate: Date;
}): string {
  return `PennyLime: ${money(p.fundedAmount)} is on the way, ${p.firstName}. First payment ${shortDate(p.firstDueDate)}. ${OPT_OUT}`;
}

export function paymentReminderSms(p: {
  firstName: string;
  amount: number;
  dueDate: Date;
}): string {
  return `PennyLime: Heads up ${p.firstName}, ${money(p.amount)} payment debits tomorrow (${shortDate(p.dueDate)}). Make sure your account is funded. ${OPT_OUT}`;
}

export function paymentFailedSms(p: {
  firstName: string;
  amount: number;
  paymentNumber: number;
}): string {
  return `PennyLime: Payment #${p.paymentNumber} for ${money(p.amount)} didn't go through. We'll retry shortly. ${OPT_OUT}`;
}

export function lateFeeAddedSms(p: {
  firstName: string;
  lateFeeAmount: number;
  totalDue: number;
  paymentNumber: number;
}): string {
  return `PennyLime: A ${money(p.lateFeeAmount)} late fee was added to payment #${p.paymentNumber}. New total ${money(p.totalDue)}. ${OPT_OUT}`;
}
