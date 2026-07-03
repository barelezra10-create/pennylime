import "server-only";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { getTrackingConfig } from "@/lib/tracking/config";

export function validateTwilioSignature(opts: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string;
}): boolean {
  const data =
    opts.url +
    Object.keys(opts.params)
      .sort()
      .map((k) => k + opts.params[k])
      .join("");
  const expected = crypto.createHmac("sha1", opts.authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(opts.signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type VerifiedWebhook =
  | { ok: true; params: Record<string, string> }
  | { ok: false; response: Response };

/**
 * Reads the form body of a Twilio webhook and validates X-Twilio-Signature.
 * The public URL is rebuilt from APP_URL/NEXTAUTH_URL because the app sits
 * behind Railway's proxy (req.url is not the URL Twilio signed).
 */
export async function readVerifiedTwilioForm(req: NextRequest, pathname: string): Promise<VerifiedWebhook> {
  const cfg = await getTrackingConfig();
  if (!cfg.twilioAuthToken) {
    return { ok: false, response: new Response("voice not configured", { status: 503 }) };
  }
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    params[k] = String(v);
  });
  const base = (process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  const url = `${base}${pathname}`;
  const signature = req.headers.get("x-twilio-signature") || "";
  if (!validateTwilioSignature({ authToken: cfg.twilioAuthToken, url, params, signature })) {
    return { ok: false, response: new Response("invalid signature", { status: 403 }) };
  }
  return { ok: true, params };
}
