import { computeAdvanceTerms } from "./cash-advance";

export type TopUpTermsInput = { amount: number; weeklyRate: number; durationWeeks: number };

export function buildTopUpTerm(input: TopUpTermsInput, requestedAmount: number) {
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > requestedAmount ||
      Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.00001) {
    throw new Error("Enter a positive amount, to the cent, no greater than the requested amount.");
  }
  if (!Number.isFinite(input.weeklyRate) || input.weeklyRate < 0 || input.weeklyRate > 100) {
    throw new Error("Enter a weekly rate between 0% and 100%.");
  }
  if (!Number.isInteger(input.durationWeeks) || input.durationWeeks < 1 || input.durationWeeks > 52) {
    throw new Error("Enter a repayment length from 1 to 52 whole weeks.");
  }
  const pricing = computeAdvanceTerms({ principal: input.amount, weeklyRate: input.weeklyRate, termWeeks: input.durationWeeks });
  // Match the existing signing/schedule engine: equal rounded weekly payments.
  const total = Math.round(pricing.weeklyPayment * input.durationWeeks * 100) / 100;
  if (!Number.isFinite(total) || total > 999999999 || total < input.amount || pricing.weeklyPayment <= 0) {
    throw new Error("These terms cannot produce a valid repayment schedule.");
  }
  return {
    weeklyRemittance: pricing.weeklyPayment,
    durationWeeks: input.durationWeeks,
    disbursedAmount: input.amount,
    totalCostOfCapital: Math.round((total - input.amount) * 100) / 100,
    processingFee: 0,
    isRecommended: true,
  };
}

// Explicit allowlist: never inherit signed offers, payments, disbursement IDs,
// funding state, or prior ACH authorizations from the original advance.
export const TOP_UP_SOURCE_FIELDS = [
  "firstName", "lastName", "email", "phone", "platform", "workerType", "businessType", "ein",
  "ssnEncrypted", "ssnHash", "dateOfBirth", "addressStreet", "addressCity", "addressState", "addressZip",
  "advancePurpose", "advancePurposeDetail", "plaidAccessToken", "plaidAccountId", "plaidItemId", "plaidUserToken",
  "plaidAssetReportToken", "plaidLinkStale", "plaidIdentityName", "plaidIdentityAddress", "plaidIdentityEmail",
  "plaidIdentityPhone", "plaidInstitutionName", "plaidAccountName", "plaidAccountMask", "plaidAccountSubtype",
  "bankName", "bankRoutingNumberManual", "bankAccountNumberManual", "bankInfoMismatch", "identityNeedsReview",
  "goachReceiverUuid", "goachBankAccountUuid", "monthlyIncome", "totalIncome", "refinedMonthlyIncome",
  "bankBalance", "availableBalance", "preferredChargeDay", "lastPlaidRefresh", "incomeByPlatformJson", "monthlyPnlJson",
] as const;

export function topUpSourceData<T extends Record<(typeof TOP_UP_SOURCE_FIELDS)[number], unknown>>(source: T) {
  return Object.fromEntries(TOP_UP_SOURCE_FIELDS.map(key => [key, source[key]])) as Pick<T, (typeof TOP_UP_SOURCE_FIELDS)[number]>;
}
