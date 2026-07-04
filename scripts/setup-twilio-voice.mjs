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
