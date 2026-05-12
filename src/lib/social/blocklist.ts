const FORBIDDEN_TERMS: ReadonlyArray<RegExp> = [
  /\bguaranteed\b/i,
  /\bguaranteed approval\b/i,
  /\bno credit check\b/i,
  /\bno credit\b/i,
  /\binstant approval\b/i,
  /\bzero fees\b/i,
  /\bno fees\b/i,
  /\b0%\s*apr\b/i,
  /\bapproved in seconds\b/i,
  /\beveryone qualifies\b/i,
  /\bbad credit ok\b/i,
  /\bany credit accepted\b/i,
  /\b\$\d{3,}\s*today\b/i,    // "$500 today" style
  /\bget cash now\b/i,
];

export interface BlocklistResult {
  passed: boolean;
  matches: string[];
}

export function checkBlocklist(text: string): BlocklistResult {
  const matches: string[] = [];
  for (const pattern of FORBIDDEN_TERMS) {
    const m = text.match(pattern);
    if (m) matches.push(m[0]);
  }
  return { passed: matches.length === 0, matches };
}
