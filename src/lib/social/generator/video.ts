import "server-only";
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
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MS = 5 * 60 * 1000; // 5 min hard cap

const ASPECTS: Record<Platform, string> = {
  instagram: "9:16",
  facebook: "9:16",
  linkedin: "9:16",
  tiktok: "9:16",
};

function brandPrompt(topic: string, aspectRatio: string): string {
  return `8-second editorial video clip for a PennyLime social reel about: "${topic}".

PENNYLIME BRAND RULES (strict):
- 2-color limit: brand lime green (#15803D primary, #A3E635 vivid highlights, #166534 deep) PLUS one neutral (ink #0A0A0A or cream #FEFCE8). NO other hues.
- Show the artifact, not the person. Render phone screens displaying rideshare maps, app dashboards, ACH bank deposit notifications, delivery bag on a doorstep, the driver's seat with a phone mounted, the seller's packing desk.
- NO faces, NO people, NO handshakes, NO offices, NO suits, NO generic team tropes.
- NO text overlays, NO numbers visible in the frame, NO logos. The reel caption carries the message.
- Audience: gig economy workers (Uber/Lyft, DoorDash/Instacart, Amazon FBA sellers, Fiverr freelancers).
- Mood: confident, plain, modern, documentary. Cool color cast. NOT generic fintech violet/blue, NOT Wall Street.
- Camera: slow, intentional. Subtle handheld breathing or smooth gimbal motion. Single sustained scene per clip. NO cuts, NO transitions, NO zooms past 1.2x.

Aspect ratio ${aspectRatio}. 8 seconds.`;
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
  const prompt = brandPrompt(topic, aspectRatio);

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
