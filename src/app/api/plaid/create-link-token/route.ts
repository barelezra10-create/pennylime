import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { CountryCode, Products } from "plaid";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { applicationId } = body;

    if (!applicationId) {
      return NextResponse.json({ error: "applicationId required" }, { status: 400 });
    }

    // OAuth banks (Chase, Capital One, Wells Fargo, etc.) require a
    // redirect_uri that's been registered in the Plaid dashboard. Without it,
    // those banks will fail at the bank's OAuth handoff step.
    const redirectUri =
      process.env.PLAID_REDIRECT_URI ||
      (process.env.APP_URL ? `${process.env.APP_URL}/apply` : undefined);

    // PLAID_PRODUCTS env var controls which products we request. Defaults to
    // all three for full underwriting. Set to e.g. "auth,identity" to drop
    // Transactions while waiting for production approval.
    const productMap: Record<string, Products> = {
      auth: Products.Auth,
      identity: Products.Identity,
      transactions: Products.Transactions,
    };
    const productList = (process.env.PLAID_PRODUCTS || "auth,identity,transactions")
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .map((p) => productMap[p])
      .filter((p): p is Products => Boolean(p));

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: applicationId },
      client_name: "PennyLime",
      products: productList.length > 0 ? productList : [Products.Auth, Products.Identity],
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: process.env.PLAID_WEBHOOK_URL,
      redirect_uri: redirectUri,
    });

    return NextResponse.json({ linkToken: response.data.link_token });
  } catch (error) {
    // Plaid returns useful diagnostic data in the response body — surface it
    // so we can see exactly which field is failing.
    const err = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error(
      "Plaid link token error:",
      err?.response?.status,
      JSON.stringify(err?.response?.data ?? { message: err?.message }),
    );
    return NextResponse.json({ error: "Failed to create link token" }, { status: 500 });
  }
}
