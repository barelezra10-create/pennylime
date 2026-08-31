import "server-only";
import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_PARSE_MODEL || "gemini-2.5-flash-lite";

// The current, accurate answer about review timing. We are backed up with a
// high volume of applications, so reviews take up to about a month. The AI ONLY
// decides whether an email is a timing question; the reply text below is fixed
// so it can never invent a wrong timeline (e.g. the marketing "1-3 hours").
function timingDraft(firstName?: string): string {
  const hi = firstName ? `Hi ${firstName},` : "Hi there,";
  return `${hi}

Thanks so much for reaching out, and for your patience.

We're currently receiving a very high volume of applications, so our review times are longer than usual right now. It's taking up to about a month to work through the queue. Your application is in line and our team is reviewing them as fast as we can.

You don't need to do anything on your end. We'll email you as soon as your application has been reviewed, and we'll reach out if we need anything further.

Thanks again for your patience.

Best,
PennyLime Support`;
}

/**
 * Ask Gemini whether an inbound support email is asking about how long the
 * application takes / when they'll hear back / status timing. Returns true only
 * for genuine timing questions.
 */
async function isTimingQuestion(subject: string, body: string): Promise<boolean> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return false;
  const ai = new GoogleGenAI({ apiKey });
  const result = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `A customer emailed our lending support inbox. Decide if they are primarily asking about TIMING: how long the application/review takes, when they will hear back, why it's taking so long, or the status/wait for a decision.\n\nSubject: ${subject}\n\nBody:\n${body.slice(0, 4000)}\n\nReturn JSON: {"timing": true} if it is a timing/how-long/when-will-I-hear-back/status-wait question, otherwise {"timing": false}. Only true for genuine timing questions, not general questions, complaints, document uploads, or unrelated topics.`,
          },
        ],
      },
    ],
    config: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 50 },
  });
  try {
    const j = JSON.parse(result.text || "{}");
    return Boolean(j.timing);
  } catch {
    return false;
  }
}

/**
 * If the inbound email is a timing question, return a fixed draft reply for a
 * human to review and send. Returns null otherwise (or if disabled / on error).
 */
export async function maybeDraftReply(
  subject: string,
  body: string,
  firstName?: string,
): Promise<{ kind: string; draft: string } | null> {
  if ((process.env.SUPPORT_AI_DRAFTS || "on").toLowerCase() === "off") return null;
  try {
    if (await isTimingQuestion(subject, body)) {
      return { kind: "timing", draft: timingDraft(firstName) };
    }
  } catch {
    // best-effort, never block inbound handling
  }
  return null;
}
