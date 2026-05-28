import "server-only";

/**
 * OpenSanctions API client.
 *
 * https://api.opensanctions.org — aggregates OFAC SDN, EU consolidated
 * sanctions, UN consolidated sanctions, UK consolidated, plus Politically
 * Exposed Persons (PEP) lists from dozens of jurisdictions. Updated daily.
 *
 * Free tier: 100 requests/day without an API key. Set
 * OPENSANCTIONS_API_KEY in env for higher limits.
 *
 * We use the /match endpoint which accepts a structured query (name +
 * optional DOB + country) and returns scored matches against the
 * default "sanctions" dataset.
 */

const MATCH_URL = "https://api.opensanctions.org/match/sanctions";

export type OpenSanctionsResult = {
  id: string;
  score: number;
  match: boolean;
  caption: string;
  schema: string;
  datasets: string[];
  properties?: Record<string, unknown>;
  topics?: string[];
};

export type ScreenInput = {
  fullName: string;
  dateOfBirth?: string | null; // YYYY-MM-DD
  addressCountry?: string | null; // ISO-2 e.g. "us"
};

export type ScreenResponse =
  | {
      ok: true;
      results: OpenSanctionsResult[];
      rawResponse: unknown;
    }
  | { ok: false; error: string };

export async function screenViaOpenSanctions(input: ScreenInput): Promise<ScreenResponse> {
  const queryProperties: Record<string, string[]> = {
    name: [input.fullName],
  };
  if (input.dateOfBirth) queryProperties.birthDate = [input.dateOfBirth];
  if (input.addressCountry) queryProperties.country = [input.addressCountry.toLowerCase()];

  const body = {
    queries: {
      q1: {
        schema: "Person",
        properties: queryProperties,
      },
    },
  };

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (process.env.OPENSANCTIONS_API_KEY) {
    headers["Authorization"] = `ApiKey ${process.env.OPENSANCTIONS_API_KEY}`;
  }

  let res: Response;
  try {
    res = await fetch(MATCH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "OpenSanctions request failed",
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: `OpenSanctions ${res.status}: ${text.slice(0, 200)}`,
    };
  }

  const raw = (await res.json()) as {
    responses?: { q1?: { results?: OpenSanctionsResult[] } };
  };
  const results = raw.responses?.q1?.results ?? [];
  return { ok: true, results, rawResponse: raw };
}
