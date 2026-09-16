/** Prevent a fallback read from silently activating an unselected subscription. */
export function isPlaidProductEnabled(product: string): boolean {
  return (process.env.PLAID_PRODUCTS || "auth,identity,assets")
    .split(",").map((value) => value.trim().toLowerCase()).includes(product);
}
