import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { encrypt } from "@/lib/encryption";

export async function POST(req: NextRequest) {
  try {
    const { publicToken, accountId } = await req.json();

    if (!publicToken) {
      return NextResponse.json({ error: "publicToken required" }, { status: 400 });
    }

    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Account selection does not need paid Auth. Validate the Link selection
    // against the Item rather than silently using the first account.
    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
    const account = accountId
      ? accountsResponse.data.accounts.find((value) => value.account_id === accountId)
      : accountsResponse.data.accounts[0];
    if (!account) {
      return NextResponse.json({ error: "Selected bank account was not found" }, { status: 400 });
    }

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
