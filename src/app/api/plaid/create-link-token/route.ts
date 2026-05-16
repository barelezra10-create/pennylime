import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { prisma } from "@/lib/db";
import { CountryCode, Products, IncomeVerificationSourceType } from "plaid";

/**
 * Creates a Plaid Link token. Two modes:
 *
 * (1) Funnel applicant — no application row yet. We pass a temporary
 *     UUID as client_user_id and mint a user_token if income_verification
 *     is requested. The user_token gets persisted later (after submit)
 *     when the application row is created.
 *
 * (2) Existing application — applicationId matches a row. Reuses the
 *     existing plaidUserToken if present, or mints + persists a fresh
 *     one. The user_token is what /credit/bank_income/get takes as input.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { applicationId } = body;

    if (!applicationId) {
      return NextResponse.json({ error: "applicationId required" }, { status: 400 });
    }

    const redirectUri =
      process.env.PLAID_REDIRECT_URI ||
      (process.env.APP_URL ? `${process.env.APP_URL}/apply` : undefined);

    // PLAID_PRODUCTS env var controls which products we request.
    // - auth: routing + account numbers (approved in prod)
    // - identity: owner name + address (approved)
    // - transactions: 90-day deposit history (pending prod approval)
    // - assets: 90-day transactions + balances + identity packaged as an
    //   asset report (enabled in prod, used as the underwriting data source
    //   since Bank Income's new-API migration is incomplete).
    // - income_verification: Plaid Bank Income. Currently rejected by Plaid
    //   for accounts created after Dec 10, 2025 because the product still
    //   requires the legacy user_token while /user/create only returns
    //   user_id on new accounts. Left in the map for when Plaid finishes
    //   the migration.
    const productMap: Record<string, Products> = {
      auth: Products.Auth,
      identity: Products.Identity,
      transactions: Products.Transactions,
      assets: Products.Assets,
      income_verification: Products.IncomeVerification,
    };
    const productList = (process.env.PLAID_PRODUCTS || "auth,identity,assets")
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .map((p) => productMap[p])
      .filter((p): p is Products => Boolean(p));

    const wantsIncome = productList.includes(Products.IncomeVerification);

    // Mint or reuse a user identifier for the application — required when
    // income_verification is among the requested products. Stored in
    // Application.plaidUserToken (column name is legacy from the pre-Dec-2025
    // user_token model; for accounts created after the cutover this holds
    // a user_id instead).
    //
    // Plaid's new user-API model (post Dec 10, 2025):
    //   /user/create → returns user_id (and sometimes user_token, depending
    //                  on account age)
    //   /link/token/create + /credit/bank_income/get accept either
    //                  user_token OR user_id; we pass whichever we got.
    let userId: string | undefined;
    let userToken: string | undefined;
    if (wantsIncome) {
      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        select: { id: true, plaidUserToken: true },
      });
      if (application?.plaidUserToken) {
        // Heuristic: usr_ prefix → user_id; otherwise treat as legacy token.
        if (application.plaidUserToken.startsWith("usr_")) {
          userId = application.plaidUserToken;
        } else {
          userToken = application.plaidUserToken;
        }
      } else {
        const userResp = await plaidClient.userCreate({ client_user_id: applicationId });
        userId = userResp.data.user_id;
        userToken = userResp.data.user_token;
        const persisted = userToken ?? userId;
        if (application && persisted) {
          await prisma.application.update({
            where: { id: application.id },
            data: { plaidUserToken: persisted },
          });
        }
      }
    }

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: applicationId },
      user_id: userId,
      user_token: userToken,
      client_name: "PennyLime",
      products: productList.length > 0 ? productList : [Products.Auth, Products.Identity],
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: process.env.PLAID_WEBHOOK_URL,
      redirect_uri: redirectUri,
      ...(wantsIncome && {
        income_verification: {
          // "bank" = read from linked bank deposits. Right fit for gig
          // workers — they don't have W-2 employers in payroll providers.
          income_source_types: [IncomeVerificationSourceType.Bank],
          bank_income: { days_requested: 90 },
        },
      }),
    });

    return NextResponse.json({
      linkToken: response.data.link_token,
      // Single field returned to the client; can hold either a user_token
      // or a user_id depending on Plaid's API version for this account.
      // The funnel just persists whatever it gets back.
      userToken: userToken ?? userId ?? null,
    });
  } catch (error) {
    const err = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error(
      "Plaid link token error:",
      err?.response?.status,
      JSON.stringify(err?.response?.data ?? { message: err?.message }),
    );
    return NextResponse.json({ error: "Failed to create link token" }, { status: 500 });
  }
}
