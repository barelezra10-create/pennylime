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

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: applicationId },
      client_name: "PennyLime",
      products: [Products.Auth, Products.Identity, Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: process.env.PLAID_WEBHOOK_URL,
    });

    return NextResponse.json({ linkToken: response.data.link_token });
  } catch (error) {
    console.error("Plaid link token error:", error);
    return NextResponse.json({ error: "Failed to create link token" }, { status: 500 });
  }
}
