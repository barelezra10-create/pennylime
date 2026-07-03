# Admin Dialer (Twilio Voice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Click-to-call browser softphone in the PennyLime admin, with recorded outbound calls (announcement first), inbound voicemail with transcription, and full call logging.

**Architecture:** Twilio Voice JS SDK in a React context (`DialerProvider`) mounted in the admin layout drives browser calls. A set of `/api/voice/*` webhook routes (signature-validated, idempotent on CallSid) generate TwiML and maintain a new `CallLog` Prisma model. Recordings stay on Twilio and stream through an authenticated admin proxy route.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (Postgres), next-auth, vitest, `twilio` (server: access tokens only), `@twilio/voice-sdk` (client).

**Spec:** `docs/superpowers/specs/2026-07-03-admin-dialer-design.md`

**Codebase conventions to follow:**
- Twilio REST calls from webhook handlers use raw `fetch`, same as `src/lib/sms/twilio.ts`.
- Twilio config lives in the `TrackingConfig` singleton, read via `getTrackingConfig()` from `src/lib/tracking/config.ts`.
- Admin API routes gate on `getServerSession(authOptions)` and return 401 without a session (see `src/app/api/admin/partner-deck/route.ts`).
- Tests are colocated `*.test.ts` files in `src/lib`, run with `npm test` (vitest).
- Commits need inline identity: `git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit ...`. Every commit message ends with the Co-Authored-By line for Claude.
- No em dashes in any generated content.

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install**

```bash
cd ~/pennylime
npm install twilio @twilio/voice-sdk
```

- [ ] **Step 2: Verify install**

Run: `node -e "const t=require('twilio'); console.log(typeof t.jwt.AccessToken)"`
Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "deps: add twilio and @twilio/voice-sdk for admin dialer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Prisma schema, CallLog model and voice config fields

**Files:**
- Modify: `prisma/schema.prisma` (TrackingConfig at line ~754, add CallLog next to SmsMessage at line ~954)

- [ ] **Step 1: Add voice fields to TrackingConfig**

In `model TrackingConfig`, directly after `twilioVerifyServiceSid String?` (line ~789), add:

```prisma
  twilioTwimlAppSid             String?
  twilioApiKeySid               String?
  twilioApiKeySecret            String?
```

- [ ] **Step 2: Add the CallLog model**

Add after the `SmsMessage` model block:

```prisma
model CallLog {
  id             String    @id @default(uuid())
  contactId      String?
  direction      String    // outbound | inbound
  kind           String    @default("call") // call | voicemail
  fromNumber     String
  toNumber       String
  twilioCallSid  String?   @unique
  status         String    @default("initiated") // initiated, ringing, in-progress, completed, no-answer, busy, failed, canceled
  durationSec    Int?
  recordingSid   String?
  recordingUrl   String?
  transcription  String?
  outcome        String?   // answered, no-answer, voicemail-left, busy, wrong-number, other
  notes          String?
  agentEmail     String?
  heardAt        DateTime?
  startedAt      DateTime?
  endedAt        DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([contactId])
  @@index([createdAt])
  @@index([status])
}
```

- [ ] **Step 3: Check what database the local .env points at**

Run: `grep DATABASE_URL .env`
This project historically points local dev at the production Postgres public URL (`centerbeam.proxy.rlwy.net:10220`). The migration below is purely additive (one new table, three nullable columns) so it is safe to apply, but confirm nothing destructive appears in the generated SQL before it runs.

- [ ] **Step 4: Create and apply the migration**

Run: `npx prisma migrate dev --name add_call_log_and_voice_config`
Expected: new folder under `prisma/migrations/`, SQL contains only `CREATE TABLE "CallLog"` plus three `ALTER TABLE "TrackingConfig" ADD COLUMN` statements. Prisma client regenerates.

- [ ] **Step 5: Verify generated client**

Run: `node -e "const {PrismaClient}=require('./src/generated/prisma'); console.log('ok')" 2>/dev/null || npx tsc --noEmit`
Expected: no type errors mentioning CallLog.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/generated
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "db: CallLog model and Twilio voice config fields

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: TwiML builders (pure, TDD)

**Files:**
- Create: `src/lib/voice/twiml.ts`
- Test: `src/lib/voice/twiml.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/voice/twiml.test.ts
import { describe, it, expect } from "vitest";
import {
  outboundDialTwiml,
  whisperTwiml,
  inboundVoicemailTwiml,
  voicemailDoneTwiml,
  rejectTwiml,
} from "./twiml";

const BASE = "https://pennylime.com";

describe("outboundDialTwiml", () => {
  it("dials the client with callerId, recording, and whisper url", () => {
    const xml = outboundDialTwiml({ callerId: "+18886912706", to: "+15551234567", baseUrl: BASE });
    expect(xml).toContain('callerId="+18886912706"');
    expect(xml).toContain('record="record-from-answer-dual"');
    expect(xml).toContain(`recordingStatusCallback="${BASE}/api/voice/recording"`);
    expect(xml).toContain(`action="${BASE}/api/voice/dial-complete"`);
    expect(xml).toContain(`url="${BASE}/api/voice/whisper"`);
    expect(xml).toContain(`statusCallback="${BASE}/api/voice/status"`);
    expect(xml).toContain(">+15551234567</Number>");
    expect(xml.startsWith("<?xml")).toBe(true);
  });

  it("escapes XML in numbers", () => {
    const xml = outboundDialTwiml({ callerId: "+1888&", to: "+1555<", baseUrl: BASE });
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;");
  });
});

describe("whisperTwiml", () => {
  it("says the recording announcement", () => {
    const xml = whisperTwiml();
    expect(xml).toContain("<Say");
    expect(xml.toLowerCase()).toContain("may be recorded");
    expect(xml.toLowerCase()).toContain("pennylime");
  });
});

describe("inboundVoicemailTwiml", () => {
  it("greets and records with transcription", () => {
    const xml = inboundVoicemailTwiml({ baseUrl: BASE });
    expect(xml).toContain("<Say");
    expect(xml.toLowerCase()).toContain("pennylime");
    expect(xml).toContain('maxLength="180"');
    expect(xml).toContain('transcribe="true"');
    expect(xml).toContain(`transcribeCallback="${BASE}/api/voice/transcription"`);
    expect(xml).toContain(`recordingStatusCallback="${BASE}/api/voice/recording"`);
    expect(xml).toContain(`action="${BASE}/api/voice/voicemail-done"`);
    expect(xml).toContain('playBeep="true"');
  });
});

describe("voicemailDoneTwiml", () => {
  it("thanks and hangs up", () => {
    const xml = voicemailDoneTwiml();
    expect(xml).toContain("<Hangup/>");
  });
});

describe("rejectTwiml", () => {
  it("says the error and hangs up", () => {
    const xml = rejectTwiml("Unable to place this call.");
    expect(xml).toContain("Unable to place this call.");
    expect(xml).toContain("<Hangup/>");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/voice/twiml.test.ts`
Expected: FAIL, cannot resolve `./twiml`.

- [ ] **Step 3: Implement**

```typescript
// src/lib/voice/twiml.ts
// Pure TwiML builders for the admin dialer. No IO, unit-testable.

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const XML = '<?xml version="1.0" encoding="UTF-8"?>';

export function outboundDialTwiml(opts: { callerId: string; to: string; baseUrl: string }): string {
  const b = opts.baseUrl.replace(/\/$/, "");
  return (
    XML +
    `<Response><Dial callerId="${esc(opts.callerId)}" record="record-from-answer-dual" ` +
    `recordingStatusCallback="${b}/api/voice/recording" action="${b}/api/voice/dial-complete">` +
    `<Number url="${b}/api/voice/whisper" statusCallback="${b}/api/voice/status" ` +
    `statusCallbackEvent="ringing answered completed">${esc(opts.to)}</Number>` +
    `</Dial></Response>`
  );
}

export function whisperTwiml(): string {
  return (
    XML +
    `<Response><Say voice="Polly.Joanna">This call is from PennyLime and may be recorded for quality purposes.</Say></Response>`
  );
}

export function inboundVoicemailTwiml(opts: { baseUrl: string }): string {
  const b = opts.baseUrl.replace(/\/$/, "");
  return (
    XML +
    `<Response><Say voice="Polly.Joanna">You have reached PennyLime. ` +
    `Please leave your name, number, and a brief message after the beep.</Say>` +
    `<Record maxLength="180" playBeep="true" transcribe="true" ` +
    `transcribeCallback="${b}/api/voice/transcription" ` +
    `recordingStatusCallback="${b}/api/voice/recording" ` +
    `action="${b}/api/voice/voicemail-done"/>` +
    `<Say voice="Polly.Joanna">We did not receive a message. Goodbye.</Say><Hangup/></Response>`
  );
}

export function voicemailDoneTwiml(): string {
  return XML + `<Response><Say voice="Polly.Joanna">Thank you. Goodbye.</Say><Hangup/></Response>`;
}

export function rejectTwiml(message: string): string {
  return XML + `<Response><Say voice="Polly.Joanna">${esc(message)}</Say><Hangup/></Response>`;
}

export function twimlResponse(xml: string): Response {
  return new Response(xml, { status: 200, headers: { "content-type": "text/xml" } });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/voice/twiml.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/twiml.ts src/lib/voice/twiml.test.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "voice: TwiML builders for dial, whisper, voicemail

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Webhook signature validation (TDD)

**Files:**
- Create: `src/lib/voice/signature.ts`
- Test: `src/lib/voice/signature.test.ts`

Twilio signs `url + sorted(paramKey+paramValue)` with HMAC-SHA1 of the auth token, base64. The pure validator is tested; the request-level helper wraps it.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/voice/signature.test.ts
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { validateTwilioSignature } from "./signature";

function sign(authToken: string, url: string, params: Record<string, string>): string {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

describe("validateTwilioSignature", () => {
  const authToken = "test_auth_token_123";
  const url = "https://pennylime.com/api/voice/outbound";
  const params = { CallSid: "CA123", To: "+15551234567", From: "client:bar" };

  it("accepts a correctly signed request", () => {
    const signature = sign(authToken, url, params);
    expect(validateTwilioSignature({ authToken, url, params, signature })).toBe(true);
  });

  it("rejects a tampered param", () => {
    const signature = sign(authToken, url, params);
    expect(
      validateTwilioSignature({ authToken, url, params: { ...params, To: "+19999999999" }, signature })
    ).toBe(false);
  });

  it("rejects a wrong-length or empty signature without throwing", () => {
    expect(validateTwilioSignature({ authToken, url, params, signature: "short" })).toBe(false);
    expect(validateTwilioSignature({ authToken, url, params, signature: "" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/voice/signature.test.ts`
Expected: FAIL, cannot resolve `./signature`.

- [ ] **Step 3: Implement validator plus the request helper**

```typescript
// src/lib/voice/signature.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/voice/signature.test.ts`
Expected: PASS (3 tests). Note: only the pure validator is unit-tested; `readVerifiedTwilioForm` is exercised in manual acceptance.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/signature.ts src/lib/voice/signature.test.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "voice: Twilio webhook signature validation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Phone candidate matching helper (TDD)

**Files:**
- Create: `src/lib/voice/phone.ts`
- Test: `src/lib/voice/phone.test.ts`

Inbound callers arrive as `+15551234567`; `Contact.phone` may be stored in any format. Reuse the candidate-list idea from `src/app/api/twilio/inbound/route.ts:22`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/voice/phone.test.ts
import { describe, it, expect } from "vitest";
import { phoneCandidates } from "./phone";

describe("phoneCandidates", () => {
  it("expands an E.164 US number into stored-format variants", () => {
    expect(phoneCandidates("+15551234567")).toEqual(
      expect.arrayContaining(["+15551234567", "15551234567", "5551234567"])
    );
  });

  it("returns an empty array for empty input", () => {
    expect(phoneCandidates("")).toEqual([]);
    expect(phoneCandidates(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/voice/phone.test.ts`
Expected: FAIL, cannot resolve `./phone`.

- [ ] **Step 3: Implement**

```typescript
// src/lib/voice/phone.ts
/** Variants of a caller's number to match against Contact.phone, which is stored unnormalized. */
export function phoneCandidates(from: string | null | undefined): string[] {
  if (!from) return [];
  const digits = from.replace(/\D/g, "");
  if (!digits) return [];
  const ten = digits.startsWith("1") ? digits.slice(1) : digits;
  return [...new Set([from, digits, ten, `+${digits}`, `+1${ten}`, `1${ten}`])];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/voice/phone.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/phone.ts src/lib/voice/phone.test.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "voice: phone candidate matching helper

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Voice access token minting (TDD)

**Files:**
- Create: `src/lib/voice/token.ts`
- Test: `src/lib/voice/token.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/voice/token.test.ts
import { describe, it, expect } from "vitest";
import { mintVoiceToken } from "./token";

function decodePayload(jwt: string) {
  return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf-8"));
}

describe("mintVoiceToken", () => {
  it("mints a JWT with a voice grant for the TwiML app", () => {
    const jwt = mintVoiceToken({
      accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      apiKeySid: "SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      apiKeySecret: "secret123",
      twimlAppSid: "APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      identity: "bar@albert-capital.com",
    });
    const payload = decodePayload(jwt);
    expect(payload.grants.identity).toBe("bar@albert-capital.com");
    expect(payload.grants.voice.outgoing.application_sid).toBe("APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
    expect(payload.grants.voice.incoming).toBeUndefined();
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(3600);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/voice/token.test.ts`
Expected: FAIL, cannot resolve `./token`.

- [ ] **Step 3: Implement**

```typescript
// src/lib/voice/token.ts
import twilio from "twilio";

export function mintVoiceToken(opts: {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
  identity: string;
}): string {
  const AccessToken = twilio.jwt.AccessToken;
  const token = new AccessToken(opts.accountSid, opts.apiKeySid, opts.apiKeySecret, {
    identity: opts.identity,
    ttl: 3600,
  });
  token.addGrant(new AccessToken.VoiceGrant({ outgoingApplicationSid: opts.twimlAppSid }));
  return token.toJwt();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/voice/token.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Run the full suite to catch regressions**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/voice/token.ts src/lib/voice/token.test.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "voice: access token minting for the browser softphone

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Settings UI for voice config

**Files:**
- Modify: `src/actions/tracking.ts` (ALLOWED_FIELDS array, line ~26)
- Modify: `src/app/admin/settings/tracking/tracking-client.tsx` (config type at line ~30, Twilio card at line ~144)

- [ ] **Step 1: Allow the new fields in the save action**

In `src/actions/tracking.ts`, extend `ALLOWED_FIELDS` after `"twilioVerifyServiceSid"`:

```typescript
  "twilioTwimlAppSid",
  "twilioApiKeySid",
  "twilioApiKeySecret",
```

- [ ] **Step 2: Add fields to the settings client**

In `tracking-client.tsx`, extend the config prop type after `twilioVerifyServiceSid: string | null;`:

```typescript
  twilioTwimlAppSid: string | null;
  twilioApiKeySid: string | null;
  twilioApiKeySecret: string | null;
```

Inside the "Twilio SMS" card (or a new sibling card titled "Twilio Voice (dialer)"), after the existing Twilio fields add, matching the existing `Field` component usage:

```tsx
<Field name="twilioTwimlAppSid" label="TwiML App SID (voice)" placeholder="AP..." defaultValue={config.twilioTwimlAppSid} />
<Field name="twilioApiKeySid" label="API Key SID (voice)" placeholder="SK..." defaultValue={config.twilioApiKeySid} />
<Field name="twilioApiKeySecret" label="API Key secret (voice)" defaultValue={config.twilioApiKeySecret} secret />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/actions/tracking.ts src/app/admin/settings/tracking/tracking-client.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "settings: Twilio voice config fields (TwiML app, API key)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Token endpoint

**Files:**
- Create: `src/app/api/voice/token/route.ts`

- [ ] **Step 1: Implement the route**

```typescript
// src/app/api/voice/token/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTrackingConfig } from "@/lib/tracking/config";
import { mintVoiceToken } from "@/lib/voice/token";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const cfg = await getTrackingConfig();
  if (!cfg.twilioAccountSid || !cfg.twilioApiKeySid || !cfg.twilioApiKeySecret || !cfg.twilioTwimlAppSid) {
    return NextResponse.json(
      { error: "Voice is not configured. Set TwiML App SID and API key in Settings > Tracking." },
      { status: 409 }
    );
  }

  const token = mintVoiceToken({
    accountSid: cfg.twilioAccountSid,
    apiKeySid: cfg.twilioApiKeySid,
    apiKeySecret: cfg.twilioApiKeySecret,
    twimlAppSid: cfg.twilioTwimlAppSid,
    identity: session.user.email,
  });

  return NextResponse.json({ token, identity: session.user.email });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/voice/token/route.ts
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "voice: access token endpoint (admin gated)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Outbound call webhooks (outbound, whisper, dial-complete, status)

**Files:**
- Create: `src/app/api/voice/outbound/route.ts`
- Create: `src/app/api/voice/whisper/route.ts`
- Create: `src/app/api/voice/dial-complete/route.ts`
- Create: `src/app/api/voice/status/route.ts`

All handlers validate the Twilio signature and upsert by CallSid so retries are safe. On the outbound webhook the CallSid is the browser leg (parent); child-leg status events carry `ParentCallSid`, and the Dial `action` and recording callbacks carry the parent CallSid, so `CallLog.twilioCallSid` always stores the parent.

- [ ] **Step 1: Implement /api/voice/outbound**

```typescript
// src/app/api/voice/outbound/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getTrackingConfig } from "@/lib/tracking/config";
import { normalizePhone } from "@/lib/tracking/hash";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";
import { outboundDialTwiml, rejectTwiml, twimlResponse } from "@/lib/voice/twiml";

export const dynamic = "force-dynamic";

/** TwiML App voice webhook: the browser leg connected, dial the client. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/outbound");
  if (!verified.ok) return verified.response;
  const p = verified.params;

  const cfg = await getTrackingConfig();
  const callerId = cfg.twilioFromNumber;
  const to = normalizePhone(p.To);
  const callSid = p.CallSid;

  if (!callerId || !to || !callSid) {
    return twimlResponse(rejectTwiml("Unable to place this call. Check the phone number and voice settings."));
  }

  // identity arrives as "client:<email>" on the From param
  const agentEmail = (p.From || "").startsWith("client:") ? p.From.slice("client:".length) : null;

  await prisma.callLog.upsert({
    where: { twilioCallSid: callSid },
    create: {
      twilioCallSid: callSid,
      contactId: p.contactId || null,
      direction: "outbound",
      kind: "call",
      fromNumber: callerId,
      toNumber: to,
      status: "initiated",
      agentEmail,
      startedAt: new Date(),
    },
    update: {},
  });

  const base = (process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  return twimlResponse(outboundDialTwiml({ callerId, to, baseUrl: base }));
}
```

- [ ] **Step 2: Implement /api/voice/whisper**

```typescript
// src/app/api/voice/whisper/route.ts
import { NextRequest } from "next/server";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";
import { whisperTwiml, twimlResponse } from "@/lib/voice/twiml";

export const dynamic = "force-dynamic";

/** Runs on the client leg the moment they answer, before bridging. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/whisper");
  if (!verified.ok) return verified.response;
  return twimlResponse(whisperTwiml());
}
```

- [ ] **Step 3: Implement /api/voice/dial-complete**

```typescript
// src/app/api/voice/dial-complete/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";
import { twimlResponse } from "@/lib/voice/twiml";

export const dynamic = "force-dynamic";

const STATUS_MAP: Record<string, string> = {
  completed: "completed",
  answered: "completed",
  "no-answer": "no-answer",
  busy: "busy",
  failed: "failed",
  canceled: "canceled",
};

/** Dial action callback on the parent leg: final outcome of the client dial. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/dial-complete");
  if (!verified.ok) return verified.response;
  const p = verified.params;

  if (p.CallSid) {
    await prisma.callLog.updateMany({
      where: { twilioCallSid: p.CallSid },
      data: {
        status: STATUS_MAP[p.DialCallStatus] || p.DialCallStatus || "completed",
        durationSec: p.DialCallDuration ? Number(p.DialCallDuration) : undefined,
        endedAt: new Date(),
      },
    });
  }

  return twimlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
}
```

- [ ] **Step 4: Implement /api/voice/status**

```typescript
// src/app/api/voice/status/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";

export const dynamic = "force-dynamic";

/** Child-leg lifecycle events (ringing, in-progress). Final state comes from dial-complete. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/status");
  if (!verified.ok) return verified.response;
  const p = verified.params;

  const parentSid = p.ParentCallSid || p.CallSid;
  const status = p.CallStatus;
  if (parentSid && (status === "ringing" || status === "in-progress")) {
    await prisma.callLog.updateMany({
      where: { twilioCallSid: parentSid, status: { in: ["initiated", "ringing"] } },
      data: { status },
    });
  }

  return new Response("ok", { status: 200 });
}
```

- [ ] **Step 5: Typecheck and run tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/voice/outbound src/app/api/voice/whisper src/app/api/voice/dial-complete src/app/api/voice/status
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "voice: outbound call webhooks (dial, whisper, status)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Inbound voicemail webhooks (inbound, voicemail-done, recording, transcription)

**Files:**
- Create: `src/app/api/voice/inbound/route.ts`
- Create: `src/app/api/voice/voicemail-done/route.ts`
- Create: `src/app/api/voice/recording/route.ts`
- Create: `src/app/api/voice/transcription/route.ts`

- [ ] **Step 1: Implement /api/voice/inbound**

```typescript
// src/app/api/voice/inbound/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";
import { phoneCandidates } from "@/lib/voice/phone";
import { inboundVoicemailTwiml, twimlResponse } from "@/lib/voice/twiml";

export const dynamic = "force-dynamic";

/** Toll-free inbound voice: greet and take a voicemail. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/inbound");
  if (!verified.ok) return verified.response;
  const p = verified.params;

  const contact = await prisma.contact.findFirst({
    where: { phone: { in: phoneCandidates(p.From) } },
    select: { id: true },
  });

  if (p.CallSid) {
    await prisma.callLog.upsert({
      where: { twilioCallSid: p.CallSid },
      create: {
        twilioCallSid: p.CallSid,
        contactId: contact?.id || null,
        direction: "inbound",
        kind: "voicemail",
        fromNumber: p.From || "",
        toNumber: p.To || "",
        status: "in-progress",
        startedAt: new Date(),
      },
      update: {},
    });
  }

  const base = (process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  return twimlResponse(inboundVoicemailTwiml({ baseUrl: base }));
}
```

- [ ] **Step 2: Implement /api/voice/voicemail-done**

```typescript
// src/app/api/voice/voicemail-done/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";
import { voicemailDoneTwiml, twimlResponse } from "@/lib/voice/twiml";

export const dynamic = "force-dynamic";

/** Record action callback: the caller finished leaving a voicemail. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/voicemail-done");
  if (!verified.ok) return verified.response;
  const p = verified.params;

  if (p.CallSid) {
    await prisma.callLog.updateMany({
      where: { twilioCallSid: p.CallSid },
      data: {
        status: "completed",
        durationSec: p.RecordingDuration ? Number(p.RecordingDuration) : undefined,
        endedAt: new Date(),
      },
    });
  }

  return twimlResponse(voicemailDoneTwiml());
}
```

- [ ] **Step 3: Implement /api/voice/recording**

```typescript
// src/app/api/voice/recording/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";

export const dynamic = "force-dynamic";

/** Recording status callback for both outbound dials and inbound voicemails. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/recording");
  if (!verified.ok) return verified.response;
  const p = verified.params;

  if (p.CallSid && p.RecordingSid) {
    await prisma.callLog.updateMany({
      where: { twilioCallSid: p.CallSid },
      data: {
        recordingSid: p.RecordingSid,
        recordingUrl: p.RecordingUrl || null,
      },
    });
  }

  return new Response("ok", { status: 200 });
}
```

- [ ] **Step 4: Implement /api/voice/transcription**

```typescript
// src/app/api/voice/transcription/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readVerifiedTwilioForm } from "@/lib/voice/signature";

export const dynamic = "force-dynamic";

/** Voicemail transcription callback. */
export async function POST(req: NextRequest) {
  const verified = await readVerifiedTwilioForm(req, "/api/voice/transcription");
  if (!verified.ok) return verified.response;
  const p = verified.params;

  if (p.CallSid && p.TranscriptionText) {
    await prisma.callLog.updateMany({
      where: { twilioCallSid: p.CallSid },
      data: { transcription: p.TranscriptionText },
    });
  }

  return new Response("ok", { status: 200 });
}
```

- [ ] **Step 5: Typecheck and run tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/voice/inbound src/app/api/voice/voicemail-done src/app/api/voice/recording src/app/api/voice/transcription
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "voice: inbound voicemail, recording, and transcription webhooks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Admin calls API (list, update, recording proxy)

**Files:**
- Create: `src/app/api/admin/calls/route.ts`
- Create: `src/app/api/admin/calls/[id]/route.ts`
- Create: `src/app/api/admin/calls/[id]/recording/route.ts`

- [ ] **Step 1: Implement GET /api/admin/calls**

```typescript
// src/app/api/admin/calls/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 });

  const sp = req.nextUrl.searchParams;
  const where: Record<string, unknown> = {};
  if (sp.get("contactId")) where.contactId = sp.get("contactId");
  if (sp.get("direction")) where.direction = sp.get("direction");
  if (sp.get("unheard") === "1") {
    where.kind = "voicemail";
    where.heardAt = null;
  }

  const calls = await prisma.callLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(sp.get("limit") || 100), 500),
  });

  return NextResponse.json({ calls });
}
```

- [ ] **Step 2: Implement PATCH /api/admin/calls/[id]**

Accepts either the CallLog id or the Twilio CallSid as `[id]`, because the browser only knows the CallSid right after a call.

```typescript
// src/app/api/admin/calls/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const OUTCOMES = ["answered", "no-answer", "voicemail-left", "busy", "wrong-number", "other"];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const body = (await req.json()) as { outcome?: string; notes?: string; heard?: boolean };

  const data: Record<string, unknown> = {};
  if (body.outcome !== undefined) {
    if (body.outcome && !OUTCOMES.includes(body.outcome)) {
      return NextResponse.json({ error: "invalid outcome" }, { status: 400 });
    }
    data.outcome = body.outcome || null;
  }
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.heard === true) data.heardAt = new Date();
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const result = await prisma.callLog.updateMany({
    where: { OR: [{ id }, { twilioCallSid: id }] },
    data,
  });
  if (result.count === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Implement the recording proxy**

```typescript
// src/app/api/admin/calls/[id]/recording/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTrackingConfig } from "@/lib/tracking/config";

export const dynamic = "force-dynamic";

/** Streams the Twilio recording audio; credentials never leave the server. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const call = await prisma.callLog.findFirst({
    where: { OR: [{ id }, { twilioCallSid: id }] },
    select: { recordingUrl: true },
  });
  if (!call?.recordingUrl) return new NextResponse("No recording", { status: 404 });

  const cfg = await getTrackingConfig();
  if (!cfg.twilioAccountSid || !cfg.twilioAuthToken) {
    return new NextResponse("Voice not configured", { status: 503 });
  }

  const auth = Buffer.from(`${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`).toString("base64");
  const upstream = await fetch(`${call.recordingUrl}.mp3`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!upstream.ok || !upstream.body) return new NextResponse("Recording unavailable", { status: 502 });

  return new NextResponse(upstream.body, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
  });
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/calls
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "admin: calls API (list, outcome/notes, recording proxy)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: DialerProvider, floating panel, CallButton

**Files:**
- Create: `src/components/admin/dialer/dialer-provider.tsx`
- Create: `src/components/admin/dialer/dialer-panel.tsx`
- Create: `src/components/admin/dialer/call-button.tsx`
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Implement the provider**

```tsx
// src/components/admin/dialer/dialer-provider.tsx
"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { Device, Call } from "@twilio/voice-sdk";
import { DialerPanel } from "./dialer-panel";

export type DialerState =
  | { phase: "idle" }
  | { phase: "connecting"; name: string; phone: string }
  | { phase: "ringing"; name: string; phone: string }
  | { phase: "in-call"; name: string; phone: string; startedAt: number }
  | { phase: "wrap-up"; name: string; phone: string; callSid: string | null; durationSec: number }
  | { phase: "error"; name: string; phone: string; message: string };

type DialerContextValue = {
  state: DialerState;
  muted: boolean;
  startCall: (opts: { phone: string; name: string; contactId?: string }) => Promise<void>;
  hangUp: () => void;
  toggleMute: () => void;
  dismiss: () => void;
  saveWrapUp: (outcome: string, notes: string) => Promise<void>;
};

const DialerContext = createContext<DialerContextValue | null>(null);

export function useDialer() {
  const ctx = useContext(DialerContext);
  if (!ctx) throw new Error("useDialer must be used inside DialerProvider");
  return ctx;
}

export function DialerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialerState>({ phase: "idle" });
  const [muted, setMuted] = useState(false);
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const startedAtRef = useRef<number>(0);

  const getDevice = useCallback(async (): Promise<Device> => {
    const res = await fetch("/api/voice/token");
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `Token request failed (${res.status})`);
    }
    const { token } = (await res.json()) as { token: string };

    if (deviceRef.current) {
      deviceRef.current.updateToken(token);
      return deviceRef.current;
    }
    const { Device } = await import("@twilio/voice-sdk");
    const device = new Device(token, { logLevel: "error" });
    device.on("tokenWillExpire", async () => {
      const r = await fetch("/api/voice/token");
      if (r.ok) device.updateToken((await r.json()).token);
    });
    deviceRef.current = device;
    return device;
  }, []);

  const startCall = useCallback(
    async (opts: { phone: string; name: string; contactId?: string }) => {
      if (callRef.current) return; // one call at a time
      setState({ phase: "connecting", name: opts.name, phone: opts.phone });
      setMuted(false);
      try {
        const device = await getDevice();
        const call = await device.connect({
          params: { To: opts.phone, contactId: opts.contactId || "" },
        });
        callRef.current = call;

        call.on("ringing", () => setState({ phase: "ringing", name: opts.name, phone: opts.phone }));
        call.on("accept", () => {
          startedAtRef.current = Date.now();
          setState({ phase: "in-call", name: opts.name, phone: opts.phone, startedAt: startedAtRef.current });
        });
        call.on("disconnect", () => {
          const durationSec = startedAtRef.current
            ? Math.round((Date.now() - startedAtRef.current) / 1000)
            : 0;
          const callSid = call.parameters?.CallSid || null;
          callRef.current = null;
          startedAtRef.current = 0;
          setState({ phase: "wrap-up", name: opts.name, phone: opts.phone, callSid, durationSec });
        });
        call.on("error", (err: Error) => {
          callRef.current = null;
          setState({ phase: "error", name: opts.name, phone: opts.phone, message: err.message });
        });
      } catch (err) {
        setState({
          phase: "error",
          name: opts.name,
          phone: opts.phone,
          message: err instanceof Error ? err.message : "Could not start call",
        });
      }
    },
    [getDevice]
  );

  const hangUp = useCallback(() => {
    callRef.current?.disconnect();
  }, []);

  const toggleMute = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    const next = !muted;
    call.mute(next);
    setMuted(next);
  }, [muted]);

  const dismiss = useCallback(() => setState({ phase: "idle" }), []);

  const saveWrapUp = useCallback(
    async (outcome: string, notes: string) => {
      if (state.phase !== "wrap-up" || !state.callSid) {
        setState({ phase: "idle" });
        return;
      }
      await fetch(`/api/admin/calls/${state.callSid}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcome, notes }),
      });
      setState({ phase: "idle" });
    },
    [state]
  );

  return (
    <DialerContext.Provider value={{ state, muted, startCall, hangUp, toggleMute, dismiss, saveWrapUp }}>
      {children}
      <DialerPanel />
    </DialerContext.Provider>
  );
}
```

- [ ] **Step 2: Implement the floating panel**

```tsx
// src/components/admin/dialer/dialer-panel.tsx
"use client";

import { useEffect, useState } from "react";
import { useDialer } from "./dialer-provider";

const OUTCOMES = [
  { value: "answered", label: "Answered" },
  { value: "no-answer", label: "No answer" },
  { value: "voicemail-left", label: "Left voicemail" },
  { value: "busy", label: "Busy" },
  { value: "wrong-number", label: "Wrong number" },
  { value: "other", label: "Other" },
];

function Timer({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.round((Date.now() - since) / 1000);
  return (
    <span className="tabular-nums">
      {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

export function DialerPanel() {
  const { state, muted, hangUp, toggleMute, dismiss, saveWrapUp } = useDialer();
  const [outcome, setOutcome] = useState("answered");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state.phase === "wrap-up") {
      setOutcome("answered");
      setNotes("");
    }
  }, [state.phase]);

  if (state.phase === "idle") return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-[#e4e4e7] bg-white shadow-xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[14px] font-semibold text-[#18181b]">{state.name}</p>
          <p className="text-[12px] text-[#71717a]">{state.phone}</p>
        </div>
        {(state.phase === "wrap-up" || state.phase === "error") && (
          <button onClick={dismiss} className="text-[#a1a1aa] hover:text-[#18181b] text-[16px] leading-none">
            x
          </button>
        )}
      </div>

      <div className="mt-3">
        {state.phase === "connecting" && <p className="text-[13px] text-[#71717a]">Connecting...</p>}
        {state.phase === "ringing" && <p className="text-[13px] text-[#2563eb]">Ringing...</p>}
        {state.phase === "in-call" && (
          <p className="text-[13px] text-[#15803d]">
            In call <Timer since={state.startedAt} />
          </p>
        )}
        {state.phase === "error" && <p className="text-[13px] text-[#dc2626]">{state.message}</p>}

        {(state.phase === "connecting" || state.phase === "ringing" || state.phase === "in-call") && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={toggleMute}
              disabled={state.phase !== "in-call"}
              className="flex-1 rounded-lg border border-[#e4e4e7] py-2 text-[13px] font-medium disabled:opacity-40"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={hangUp}
              className="flex-1 rounded-lg bg-[#dc2626] text-white py-2 text-[13px] font-medium"
            >
              Hang up
            </button>
          </div>
        )}

        {state.phase === "wrap-up" && (
          <div className="mt-2 space-y-2">
            <p className="text-[12px] text-[#71717a]">
              Call ended{state.durationSec ? ` after ${state.durationSec}s` : ""}. Log the outcome:
            </p>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="w-full rounded-lg border border-[#e4e4e7] px-2 py-1.5 text-[13px]"
            >
              {OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full rounded-lg border border-[#e4e4e7] px-2 py-1.5 text-[13px]"
            />
            <button
              onClick={async () => {
                setSaving(true);
                await saveWrapUp(outcome, notes);
                setSaving(false);
              }}
              disabled={saving}
              className="w-full rounded-lg bg-[#18181b] text-white py-2 text-[13px] font-medium disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Implement CallButton**

```tsx
// src/components/admin/dialer/call-button.tsx
"use client";

import { useDialer } from "./dialer-provider";

export function CallButton({
  phone,
  name,
  contactId,
  compact = false,
}: {
  phone: string | null | undefined;
  name: string;
  contactId?: string;
  compact?: boolean;
}) {
  const { state, startCall } = useDialer();
  const busy = state.phase !== "idle" && state.phase !== "wrap-up" && state.phase !== "error";
  const disabled = !phone || busy;

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!phone) return;
    void startCall({ phone, name, contactId });
  };

  if (compact) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        title={!phone ? "No phone number" : busy ? "Call in progress" : `Call ${name}`}
        className="rounded-md p-1 text-[#2563eb] hover:bg-[#eff6ff] disabled:opacity-30 disabled:hover:bg-transparent"
      >
        &#9742;
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={!phone ? "No phone number" : undefined}
      className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
    >
      &#9742; Call
    </button>
  );
}
```

- [ ] **Step 4: Mount the provider in the admin layout**

In `src/app/admin/layout.tsx`, wrap the signed-in branch:

```tsx
import { DialerProvider } from "@/components/admin/dialer/dialer-provider";
// ...
  return (
    <DialerProvider>
      <div className="min-h-screen bg-[#f8f8f6]">
        <AdminTopNav userName={session.user?.name || session.user?.email || "Admin"} />
        <CommandPalette />
        <main className="p-6 lg:p-8 max-w-[1400px] mx-auto">{children}</main>
      </div>
    </DialerProvider>
  );
```

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean build. (`@twilio/voice-sdk` is client-only and dynamically imported, so the server bundle stays clean.)

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/dialer src/app/admin/layout.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "dialer: softphone provider, floating panel, call button

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Call buttons and call history on contact detail and pipeline

**Files:**
- Create: `src/components/admin/dialer/contact-calls.tsx`
- Modify: `src/app/admin/contacts/[id]/contact-detail-client.tsx` (phone row at line ~285)
- Modify: `src/app/admin/pipeline/pipeline-client.tsx` (card at line ~105)

- [ ] **Step 1: Implement the ContactCalls section**

```tsx
// src/components/admin/dialer/contact-calls.tsx
"use client";

import { useEffect, useState } from "react";

type CallRow = {
  id: string;
  direction: string;
  kind: string;
  status: string;
  outcome: string | null;
  notes: string | null;
  durationSec: number | null;
  recordingSid: string | null;
  transcription: string | null;
  createdAt: string;
};

export function ContactCalls({ contactId }: { contactId: string }) {
  const [calls, setCalls] = useState<CallRow[] | null>(null);

  useEffect(() => {
    fetch(`/api/admin/calls?contactId=${encodeURIComponent(contactId)}`)
      .then((r) => (r.ok ? r.json() : { calls: [] }))
      .then((d) => setCalls(d.calls))
      .catch(() => setCalls([]));
  }, [contactId]);

  if (calls === null) return <p className="text-[13px] text-[#71717a]">Loading calls...</p>;
  if (calls.length === 0) return <p className="text-[13px] text-[#71717a]">No calls yet.</p>;

  return (
    <div className="space-y-3">
      {calls.map((c) => (
        <div key={c.id} className="rounded-lg border border-[#e4e4e7] bg-white p-3">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-medium text-[#18181b]">
              {c.direction === "outbound" ? "Outbound call" : c.kind === "voicemail" ? "Voicemail" : "Inbound call"}
              {c.outcome ? ` (${c.outcome})` : ""}
            </span>
            <span className="text-[#71717a]">
              {new Date(c.createdAt).toLocaleString()}
              {c.durationSec ? ` , ${c.durationSec}s` : ""}
            </span>
          </div>
          {c.transcription && (
            <p className="mt-1.5 text-[12px] text-[#3f3f46] italic">&ldquo;{c.transcription}&rdquo;</p>
          )}
          {c.notes && <p className="mt-1.5 text-[12px] text-[#3f3f46]">{c.notes}</p>}
          {c.recordingSid && (
            <audio className="mt-2 w-full h-8" controls preload="none" src={`/api/admin/calls/${c.id}/recording`} />
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire into contact detail**

In `contact-detail-client.tsx`:
- Import `CallButton` and `ContactCalls` from `@/components/admin/dialer/...`.
- Next to the phone display (line ~285-291), add:

```tsx
<CallButton
  phone={contact.phone}
  name={`${contact.firstName} ${contact.lastName || ""}`.trim()}
  contactId={contact.id}
/>
```

- Add a "Calls" card/section following the file's existing section pattern (find the activities or SMS section and mirror its wrapper markup), containing:

```tsx
<ContactCalls contactId={contact.id} />
```

- [ ] **Step 3: Wire into pipeline cards**

In `pipeline-client.tsx`, inside the card (the `ContactCard` interface at line ~11 already has `phone`), add a compact call button beside the contact name (line ~107), outside the `Link` or with propagation stopped (CallButton already stops propagation):

```tsx
<CallButton
  compact
  phone={contact.phone}
  name={`${contact.firstName} ${contact.lastName || ""}`.trim()}
  contactId={contact.id}
/>
```

Import at top: `import { CallButton } from "@/components/admin/dialer/call-button";`

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Visual smoke test**

Run: `npm run dev`, open `http://localhost:3000/admin/pipeline` and a contact detail page. Verify the call buttons render, and the button is disabled for contacts without a phone. Without Twilio voice config, clicking should show the error state in the panel ("Voice is not configured...").

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/dialer/contact-calls.tsx "src/app/admin/contacts/[id]/contact-detail-client.tsx" src/app/admin/pipeline/pipeline-client.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "dialer: call buttons on contact detail and pipeline, call history section

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: /admin/calls page and nav link

**Files:**
- Create: `src/app/admin/calls/page.tsx`
- Create: `src/app/admin/calls/calls-client.tsx`
- Modify: `src/components/admin/top-nav.tsx`

- [ ] **Step 1: Implement the server page**

```tsx
// src/app/admin/calls/page.tsx
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { CallsClient } from "./calls-client";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const calls = await prisma.callLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const contactIds = [...new Set(calls.map((c) => c.contactId).filter((x): x is string => !!x))];
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameById = new Map(contacts.map((c) => [c.id, `${c.firstName} ${c.lastName || ""}`.trim()]));

  return (
    <div>
      <PageHeader title="Calls" description="Outbound calls and inbound voicemails" />
      <CallsClient
        calls={calls.map((c) => ({
          id: c.id,
          contactId: c.contactId,
          contactName: c.contactId ? nameById.get(c.contactId) || null : null,
          direction: c.direction,
          kind: c.kind,
          fromNumber: c.fromNumber,
          toNumber: c.toNumber,
          status: c.status,
          outcome: c.outcome,
          notes: c.notes,
          durationSec: c.durationSec,
          hasRecording: !!c.recordingSid,
          transcription: c.transcription,
          heard: !!c.heardAt,
          agentEmail: c.agentEmail,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 2: Implement the client list**

```tsx
// src/app/admin/calls/calls-client.tsx
"use client";

import { useState } from "react";
import Link from "next/link";

type Row = {
  id: string;
  contactId: string | null;
  contactName: string | null;
  direction: string;
  kind: string;
  fromNumber: string;
  toNumber: string;
  status: string;
  outcome: string | null;
  notes: string | null;
  durationSec: number | null;
  hasRecording: boolean;
  transcription: string | null;
  heard: boolean;
  agentEmail: string | null;
  createdAt: string;
};

export function CallsClient({ calls }: { calls: Row[] }) {
  const [filter, setFilter] = useState<"all" | "outbound" | "voicemail" | "unheard">("all");
  const [heardIds, setHeardIds] = useState<Set<string>>(new Set());

  const rows = calls.filter((c) => {
    if (filter === "outbound") return c.direction === "outbound";
    if (filter === "voicemail") return c.kind === "voicemail";
    if (filter === "unheard") return c.kind === "voicemail" && !c.heard && !heardIds.has(c.id);
    return true;
  });

  const markHeard = async (id: string) => {
    setHeardIds((s) => new Set(s).add(id));
    await fetch(`/api/admin/calls/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ heard: true }),
    });
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(["all", "outbound", "voicemail", "unheard"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-[12px] font-medium border ${
              filter === f
                ? "bg-[#18181b] text-white border-[#18181b]"
                : "bg-white text-[#3f3f46] border-[#e4e4e7]"
            }`}
          >
            {f === "all" ? "All" : f === "outbound" ? "Outbound" : f === "voicemail" ? "Voicemails" : "Unheard"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <p className="text-[13px] text-[#71717a]">No calls.</p>}
        {rows.map((c) => {
          const unheard = c.kind === "voicemail" && !c.heard && !heardIds.has(c.id);
          return (
            <div
              key={c.id}
              className={`rounded-lg border bg-white p-3 ${unheard ? "border-[#2563eb]" : "border-[#e4e4e7]"}`}
            >
              <div className="flex items-center justify-between text-[13px]">
                <div className="flex items-center gap-2">
                  {unheard && <span className="h-2 w-2 rounded-full bg-[#2563eb]" />}
                  <span className="font-medium text-[#18181b]">
                    {c.direction === "outbound" ? "Outbound" : c.kind === "voicemail" ? "Voicemail" : "Inbound"}
                  </span>
                  {c.contactId ? (
                    <Link href={`/admin/contacts/${c.contactId}`} className="text-[#2563eb] hover:underline">
                      {c.contactName || "Contact"}
                    </Link>
                  ) : (
                    <span className="text-[#71717a]">{c.direction === "outbound" ? c.toNumber : c.fromNumber}</span>
                  )}
                  {c.outcome && <span className="text-[#71717a]">({c.outcome})</span>}
                </div>
                <span className="text-[12px] text-[#71717a]">
                  {new Date(c.createdAt).toLocaleString()}
                  {c.durationSec ? ` , ${c.durationSec}s` : ""}
                </span>
              </div>
              {c.transcription && (
                <p className="mt-1.5 text-[12px] text-[#3f3f46] italic">&ldquo;{c.transcription}&rdquo;</p>
              )}
              {c.notes && <p className="mt-1.5 text-[12px] text-[#3f3f46]">{c.notes}</p>}
              {c.hasRecording && (
                <audio
                  className="mt-2 w-full h-8"
                  controls
                  preload="none"
                  src={`/api/admin/calls/${c.id}/recording`}
                  onPlay={() => unheard && markHeard(c.id)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add the nav link**

In `src/components/admin/top-nav.tsx`, find the nav group whose sub-items include `/admin/contacts` (or `/admin/pipeline`) and add:

```typescript
{ href: "/admin/calls", label: "Calls" },
```

If the group uses a `prefixes` array, add `"/admin/calls"` to it.

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/calls src/components/admin/top-nav.tsx
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "admin: calls page with voicemail playback and unheard filter

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: Twilio console setup script and deploy

**Files:**
- Create: `scripts/setup-twilio-voice.mjs`

- [ ] **Step 1: Write the setup script**

```javascript
// scripts/setup-twilio-voice.mjs
// One-time Twilio voice setup for the admin dialer.
// Usage: TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... node scripts/setup-twilio-voice.mjs
// Creates an API key and a TwiML App, points the toll-free number's Voice URL
// at production, and prints the three values to paste into admin settings.

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const BASE_URL = process.env.APP_URL || "https://pennylime.com";
const PHONE = process.env.TWILIO_PHONE || "+18886912706";

if (!SID || !TOKEN) {
  console.error("Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars.");
  process.exit(1);
}

const auth = Buffer.from(`${SID}:${TOKEN}`).toString("base64");
const api = `https://api.twilio.com/2010-04-01/Accounts/${SID}`;

async function post(url, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function get(url) {
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

// 1. API key for access tokens
const key = await post(`${api}/Keys.json`, { FriendlyName: "pennylime-admin-dialer" });
console.log("API Key SID:   ", key.sid);
console.log("API Key Secret:", key.secret, "(shown once, save it now)");

// 2. TwiML App pointing at the outbound webhook
const app = await post(`${api}/Applications.json`, {
  FriendlyName: "pennylime-admin-dialer",
  VoiceUrl: `${BASE_URL}/api/voice/outbound`,
  VoiceMethod: "POST",
});
console.log("TwiML App SID: ", app.sid);

// 3. Point the toll-free number's voice URL at the inbound webhook
const nums = await get(`${api}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(PHONE)}`);
const num = nums.incoming_phone_numbers?.[0];
if (!num) {
  console.warn(`Number ${PHONE} not found on this account; set its Voice URL manually to ${BASE_URL}/api/voice/inbound`);
} else {
  console.log("Number capabilities:", JSON.stringify(num.capabilities));
  if (!num.capabilities?.voice) {
    console.warn("WARNING: this number is not voice-capable. Buy a voice number or contact Twilio support.");
  }
  await post(`${api}/IncomingPhoneNumbers/${num.sid}.json`, {
    VoiceUrl: `${BASE_URL}/api/voice/inbound`,
    VoiceMethod: "POST",
  });
  console.log(`Voice URL set on ${PHONE} -> ${BASE_URL}/api/voice/inbound`);
}

console.log("\nPaste into /admin/settings/tracking:");
console.log("  TwiML App SID (voice):", app.sid);
console.log("  API Key SID (voice):  ", key.sid);
console.log("  API Key secret (voice): (the secret printed above)");
```

- [ ] **Step 2: Commit**

```bash
git add scripts/setup-twilio-voice.mjs
git -c user.email="bar@albert-capital.com" -c user.name="Bar Elezra" commit -m "voice: one-time Twilio console setup script

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Run the full test suite and build one last time**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: everything green.

- [ ] **Step 4: Deploy (requires Bar's go-ahead)**

```bash
git push origin main
```

Railway runs `prisma migrate deploy` on start, which applies the CallLog migration (already applied if Step 4 of Task 2 ran against the production DB, in which case migrate deploy records it as applied and moves on).

- [ ] **Step 5: One-time console setup (Bar runs, credentials from Twilio console)**

```bash
TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... node scripts/setup-twilio-voice.mjs
```

Then paste the three printed values into `/admin/settings/tracking` and save.

- [ ] **Step 6: Manual acceptance checklist**

1. From `/admin/contacts/<id>` of a contact with your cell number, click Call. Browser asks for mic permission, your cell rings from +18886912706.
2. Answer: you hear the "may be recorded" announcement first, then you are connected.
3. Hang up in the panel, pick an outcome, add a note, save.
4. The call appears in the contact's Calls section and `/admin/calls` with duration; the recording player works (recording appears within ~1 minute).
5. Call +18886912706 from your cell: greeting plays, leave a message.
6. The voicemail appears in `/admin/calls` highlighted as unheard, with transcription (may lag by a minute) and playback; playing it clears the unheard mark.
7. A contact without a phone number shows a disabled call button.

---

## Self-review notes

- Spec coverage: data model (Task 2), settings fields (Task 7), all 8 voice webhooks plus voicemail-done (Tasks 9-10), admin calls API incl. recording proxy (Task 11), provider/panel/buttons (Tasks 12-13), calls page + nav (Task 14), console setup + acceptance (Task 15). Unit tests: TwiML builders, signature validation, phone matching, token minting (Tasks 3-6), matching the spec's testing section.
- The spec's `/api/voice/voicemail-done` was implicit ("hangup fallback"); it is explicit here as a route.
- Types line up: `readVerifiedTwilioForm` returns `{ok, params}` used by all webhook tasks; `CallButton` props match both call sites; PATCH accepts id or CallSid, used by both the wrap-up form (CallSid) and calls page (id).
