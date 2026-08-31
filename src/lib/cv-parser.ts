import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_PARSE_MODEL || "gemini-2.5-flash-lite";

export type CvFields = {
  fullName: string;
  email: string;
  phone: string;
  linkedin: string;
  yearsExperience: string;
  mcaExperience: boolean;
  summary: string;
};

const SYSTEM_PROMPT = `You are a recruiting assistant. You read a candidate's CV/resume (PDF or Word) and extract their contact details and experience. Only use information present in the document. If a field is missing, return an empty string (or false for booleans). Do not invent data.`;

const SCHEMA = `{
  "fullName": "string - the candidate's full name",
  "email": "string - their email address, or empty",
  "phone": "string - their phone number, or empty",
  "linkedin": "string - their LinkedIn URL if present, or empty",
  "yearsExperience": "string - total years of underwriting / lending / credit experience as a number like \\"7\\" (best estimate from the roles listed), or empty",
  "mcaExperience": "boolean - true if the CV shows merchant cash advance (MCA), business funding, revenue-based financing, or cash-advance underwriting experience",
  "summary": "string - one short sentence summarizing their most relevant experience"
}`;

/** Extract candidate fields from a CV file (PDF/DOC/DOCX) using Gemini. */
export async function parseCv(buffer: Buffer, mimeType: string): Promise<CvFields> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const ai = new GoogleGenAI({ apiKey });

  const result = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: buffer.toString("base64") } },
          { text: `Extract the candidate details from the CV above. Return JSON matching this schema:\n\n${SCHEMA}` },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0,
      responseMimeType: "application/json",
      maxOutputTokens: 2048,
    },
  });

  const text = result.text;
  if (!text) throw new Error("Empty response from Gemini");
  const j = JSON.parse(text) as Partial<CvFields>;
  return {
    fullName: String(j.fullName || "").trim(),
    email: String(j.email || "").trim(),
    phone: String(j.phone || "").trim(),
    linkedin: String(j.linkedin || "").trim(),
    yearsExperience: String(j.yearsExperience || "").trim(),
    mcaExperience: Boolean(j.mcaExperience),
    summary: String(j.summary || "").trim(),
  };
}
