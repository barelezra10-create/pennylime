import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { encrypt } from "@/lib/encryption";

export async function POST(req: NextRequest) {
  try {
    const { publicToken } = await req.json();

    if (!publicToken) {
      return NextResponse.json({ error: "publicToken required" }, { status: 400 });
    }

    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Get auth to retrieve account info
    const authResponse = await plaidClient.authGet({ access_token: accessToken });
    const account = authResponse.data.accounts[0];

    // Encrypt access token before returning
    const encryptedToken = encrypt(accessToken);

    return NextResponse.json({
      accessToken: encryptedToken,
      itemId,
      accountId: account?.account_id || null,
    });
  } catch (error) {
    console.error("Plaid exchange error:", error);
    return NextResponse.json({ error: "Failed to exchange token" }, { status: 500 });
  }
}
