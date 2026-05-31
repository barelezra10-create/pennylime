import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { Platform } from "../types";
import { saveImage } from "../storage"; // re-used: writes any buffer + ext, returns served URL

// Veo flow:
//   1. POST /v1beta/models/{model}:predictLongRunning  ->  operation name
//   2. Poll  GET /v1beta/{operation_name}              ->  done:true with video uri
//   3. Download the video bytes (require key on download URL)
//   4. Save to disk via saveImage(buf, "mp4")
//
// We use 3.1-fast preview (cheapest of the 3.1 family, ~30-60s gen).

const VEO_MODEL = "veo-3.1-fast-generate-preview";
const SCENE_MODEL = "gemini-2.5-flash";
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MS = 5 * 60 * 1000; // 5 min hard cap

const ASPECTS: Record<Platform, string> = {
  instagram: "9:16",
  facebook: "9:16",
  linkedin: "9:16",
  tiktok: "9:16",
};

let _client: GoogleGenAI | undefined;
function getClient(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY required");
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

// Translate the topic into a *wordless visual scene with camera motion*.
// We avoid passing the topic verbatim, the brand name, or any hex codes —
// Veo (like Imagen) will render text it sees in its prompt.
async function describeShot(client: GoogleGenAI, topic: string): Promise<string> {
  const prompt = `Given this content topic for a gig-economy finance brand:

"${topic}"

Describe ONE concrete 8-second video shot that represents this topic. Constraints:
- 1-2 sentences, ~30 words
- Specific physical objects only (phone screen with app UI, car dashboard, gas pump, paper receipt, delivery bag on doorstep, packing tape on cardboard box, etc.)
- One sustained scene, slow intentional camera move (slow push-in, subtle pan, gentle hand-held drift)
- NO people, NO faces, NO hands, NO signs with readable words, NO logos, NO numbers
- US setting only — no foreign-language signage, no non-Latin scripts (no Arabic, no Cyrillic, no Chinese/Japanese/Korean characters)
- Concrete time-of-day + lighting cue (early-morning windshield light, neon glow from phone in dark cab, kitchen-table light on tax forms, etc.)

Output ONLY the shot description. No preamble. No quotes.`;

  const res = await client.models.generateContent({
    model: SCENE_MODEL,
    contents: prompt,
  });
  return (res.text ?? "").replace(/^["']|["']$/g, "").trim();
}

function buildVeoPrompt(shot: string, aspectRatio: string): string {
  return `8-second editorial documentary video clip, ${aspectRatio} aspect ratio.

Shot: ${shot}

Visual style:
A two-color palette only. Deep emerald forest green for primary shapes, vivid citrus lime green for highlights and accents. Background and neutrals in either warm cream paper or deep charcoal ink. No other hues. Soft natural lighting. Slight film grain.

Composition and camera:
Documentary observational angle, tight on the object. Single sustained scene, no cuts, no transitions. Slow intentional camera motion only (subtle hand-held breathing, gentle gimbal drift, very slow push-in under 1.2x). The scene is wordless and silent.

Quality:
Editorial, modern, calm, confident. Real-world physical lighting. Not 3D rendered. Not cartoonish. Not stock footage. Not generic fintech gradient.

Typography:
If any incidental lettering appears (a receipt header, an app screen label, a button caption), it is rendered in clean English using the standard Latin alphabet. No Arabic script, no Cyrillic, no Chinese / Japanese / Korean characters, no decorative foreign typography, no garbled or invented characters. US-style English only.`;
}

interface VeoOperation {
  name: string;
  done?: boolean;
  error?: { message: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: { uri?: string } }>;
    };
    generatedVideos?: Array<{ video?: { uri?: string } }>;
  };
}

export async function generatePostVideo(topic: string, platform: Platform): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY required");

  const aspectRatio = ASPECTS[platform];
  const client = getClient();

  let shot: string;
  try {
    shot = await describeShot(client, topic);
    if (!shot) throw new Error("Gemini returned empty shot description");
  } catch (err) {
    throw new Error(
      `Shot description failed [${platform}, "${topic}"]: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const prompt = buildVeoPrompt(shot, aspectRatio);

  // 1. Kick off the long-running operation
  const startUrl = `https://generativelanguage.googleapis.com/v1beta/models/${VEO_MODEL}:predictLongRunning?key=${apiKey}`;
  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { aspectRatio, durationSeconds: 8, sampleCount: 1 },
    }),
  });
  const startJson = await startRes.json();
  const opName: string | undefined = startJson?.name;
  if (!opName) {
    throw new Error(`Veo predictLongRunning failed [${platform}, "${topic}"]: ${JSON.stringify(startJson)}`);
  }

  // 2. Poll the operation
  const deadline = Date.now() + POLL_MAX_MS;
  let op: VeoOperation = { name: opName };
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${opName}?key=${apiKey}`,
    );
    op = (await pollRes.json()) as VeoOperation;
    if (op.error) {
      throw new Error(`Veo operation failed [${platform}, "${topic}"]: ${op.error.message}`);
    }
    if (op.done) break;
  }
  if (!op.done) {
    throw new Error(`Veo operation timed out after ${POLL_MAX_MS / 1000}s [${platform}, "${topic}"]`);
  }

  // 3. Extract the video URI (response shape varies slightly across model versions)
  const samples = op.response?.generateVideoResponse?.generatedSamples
    ?? op.response?.generatedVideos
    ?? [];
  const uri = samples[0]?.video?.uri;
  if (!uri) {
    throw new Error(`Veo response had no video uri [${platform}, "${topic}"]: ${JSON.stringify(op.response)}`);
  }

  // 4. Download bytes (Veo returns a URI that requires the same key in the query)
  const dlUrl = uri.includes("?") ? `${uri}&key=${apiKey}` : `${uri}?key=${apiKey}`;
  const vidRes = await fetch(dlUrl);
  if (!vidRes.ok) {
    throw new Error(`Veo video download failed (${vidRes.status}): ${await vidRes.text()}`);
  }
  const buf = Buffer.from(await vidRes.arrayBuffer());
  return await saveImage(buf, "mp4");
}
