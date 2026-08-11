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

// Active-advance heads-up a few days before a scheduled debit.
export function upcomingPaymentSms(p: {
  firstName: string;
  amount: number;
  dueDate: Date;
  daysUntil: number;
}): string {
  const when = p.daysUntil === 1 ? "tomorrow" : `in ${p.daysUntil} days`;
  return `PennyLime: Hi ${p.firstName}, your ${money(p.amount)} payment is coming up ${when} on ${shortDate(p.dueDate)}. Please have your account funded. ${OPT_OUT}`;
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

// NSF roll: the missed payment was moved to the end of the plan + a late fee
// added. Tell the borrower and point them at the very next scheduled debit.
export function paymentRolledSms(p: {
  firstName: string;
  amount: number;
  lateFeeAmount: number;
  nextDueDate: Date | null;
  nextAmount: number | null;
}): string {
  const next =
    p.nextDueDate && p.nextAmount != null
      ? ` Please have funds ready for your next payment of ${money(p.nextAmount)} on ${shortDate(p.nextDueDate)}.`
      : " Please keep your account funded for your next payment.";
  return `PennyLime: ${p.firstName}, your ${money(p.amount)} payment didn't go through. We moved it to the end of your plan and added a ${money(p.lateFeeAmount)} late fee.${next} ${OPT_OUT}`;
}

// Recovery nudge: 2 days before the next payment for borrowers who recently
// had an NSF, so they don't bounce again.
export function fundsReadyReminderSms(p: {
  firstName: string;
  amount: number;
  dueDate: Date;
}): string {
  return `PennyLime: ${p.firstName}, your ${money(p.amount)} payment debits ${shortDate(p.dueDate)}. After a recent missed payment, please make sure the funds are ready to avoid another fee. ${OPT_OUT}`;
}

// Collections ladder. Firm but factual. STOP/HELP footer kept on every step.
export function collectionWarningSms(p: {
  firstName: string;
  applicationCode: string;
  daysOverdue: number;
  totalOverdue: number;
  isSecondWarning: boolean;
}): string {
  const lead = p.isSecondWarning ? "SECOND NOTICE" : "Past due";
  const tail = p.isSecondWarning
    ? "Pay now to avoid collections."
    : "Please bring it current to avoid fees.";
  return `PennyLime: ${lead} ${p.firstName}. Your advance is ${p.daysOverdue} days behind, ${money(p.totalOverdue)} due. ${tail} ${statusLine(p.applicationCode)} ${OPT_OUT}`;
}

export function collectionEscalationSms(p: {
  firstName: string;
  applicationCode: string;
  totalOverdue: number;
}): string {
  return `PennyLime: ${p.firstName}, your advance has moved to collections with ${money(p.totalOverdue)} outstanding. Contact us today to resolve it. ${statusLine(p.applicationCode)} ${OPT_OUT}`;
}

// Pre-legal final notice before default/referral.
export function collectionFinalNoticeSms(p: {
  firstName: string;
  applicationCode: string;
  totalOverdue: number;
  respondByDays?: number;
}): string {
  const days = p.respondByDays ?? 7;
  return `PennyLime: FINAL NOTICE ${p.firstName}. ${money(p.totalOverdue)} remains unpaid. Respond within ${days} days or your account may be defaulted and referred for collection/legal action. ${statusLine(p.applicationCode)} ${OPT_OUT}`;
}

// Recurring collections reminder between the milestone notices.
export function collectionDunningSms(p: {
  firstName: string;
  applicationCode: string;
  totalOverdue: number;
}): string {
  return `PennyLime: ${p.firstName}, your ${money(p.totalOverdue)} balance is still unpaid and in collections. Please resolve it or contact us to arrange payment. ${statusLine(p.applicationCode)} ${OPT_OUT}`;
}
