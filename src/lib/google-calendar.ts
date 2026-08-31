import "server-only";
import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import { APP_URL } from "@/lib/email";

// Google Calendar integration for auto-creating interview events with a Google
// Meet link. Follows the same raw-OAuth (refresh-token) pattern used by the
// Google Ads code — no extra library. The refresh token is stored encrypted in
// the LoanRule key/value table; the OAuth client id/secret come from env.

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];
const RT_KEY = "google_calendar_refresh_token";
const EMAIL_KEY = "google_calendar_email";

const clientId = () => process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const clientSecret = () => process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
export const redirectUri = () => `${APP_URL}/api/hr/google/callback`;
export const googleConfigured = () => Boolean(clientId() && clientSecret());

export function consentUrl(): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

async function kvGet(key: string): Promise<string | null> {
  const r = await prisma.loanRule.findUnique({ where: { key } });
  return r?.value ?? null;
}
async function kvSet(key: string, value: string, description: string) {
  await prisma.loanRule.upsert({
    where: { key },
    update: { value },
    create: { key, value, description },
  });
}

export async function isCalendarConnected(): Promise<boolean> {
  return Boolean(await kvGet(RT_KEY));
}
export async function connectedEmail(): Promise<string | null> {
  return kvGet(EMAIL_KEY);
}

/** Exchange an OAuth code for a refresh token and persist it (encrypted). */
export async function exchangeCodeAndStore(code: string): Promise<void> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const j = await res.json();
  if (!j.refresh_token) {
    throw new Error(j.error_description || j.error || "Google did not return a refresh token. Remove PennyLime from your Google account's connected apps and try again.");
  }
  await kvSet(RT_KEY, encrypt(j.refresh_token), "Google Calendar OAuth refresh token (encrypted)");
  if (j.access_token) {
    try {
      const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${j.access_token}` },
      });
      const u = await ui.json();
      if (u.email) await kvSet(EMAIL_KEY, u.email, "Connected Google Calendar account email");
    } catch {
      // non-fatal
    }
  }
}

async function accessToken(): Promise<string> {
  const enc = await kvGet(RT_KEY);
  if (!enc) throw new Error("Google Calendar not connected");
  const refresh = decrypt(enc);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(j.error_description || j.error || "Token refresh failed");
  return j.access_token;
}

/** Create a Google Calendar event with a Meet link. Google emails the attendee. */
export async function createInterviewEvent(input: {
  summary: string;
  description: string;
  startISO: string;
  durationMin: number;
  attendeeEmail: string;
  attendeeName?: string;
}): Promise<{ meetLink: string | null; htmlLink: string | null; eventId: string | null }> {
  const token = await accessToken();
  const start = new Date(input.startISO);
  const end = new Date(start.getTime() + input.durationMin * 60000);
  const body = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees: input.attendeeEmail
      ? [{ email: input.attendeeEmail, displayName: input.attendeeName }]
      : [],
    conferenceData: {
      createRequest: {
        requestId: `pl-hr-${start.getTime()}-${Math.floor((start.getTime() % 1000000))}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "Calendar event creation failed");
  const meetLink =
    j.hangoutLink ||
    j.conferenceData?.entryPoints?.find((e: { entryPointType?: string; uri?: string }) => e.entryPointType === "video")?.uri ||
    null;
  return { meetLink, htmlLink: j.htmlLink || null, eventId: j.id || null };
}
