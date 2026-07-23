import type { ParsedDeposit } from "@/lib/bank-statement-parser";

export type PlatformMonth = { month: string; amount: number; count: number }; // month "YYYY-MM"
export type PlatformIncome = { platform: string; isListed: boolean; total: number; byMonth: PlatformMonth[] };
export type IncomeByPlatform = { months: string[]; platforms: PlatformIncome[]; grandTotal: number };

// Order matters: put more specific keys first so "uber eats" doesn't match "Uber".
const PLATFORM_KEYWORDS: [string, string[]][] = [
  ["Uber Eats", ["uber eats", "ubereats"]],
  ["Uber", ["uber"]],
  ["Lyft", ["lyft"]],
  ["DoorDash", ["doordash", "door dash"]],
  ["Instacart", ["instacart", "maplebear"]],
  ["Amazon Flex", ["amazon flex", "amzn flex", "amazonflex"]],
  ["Grubhub", ["grubhub", "grub hub"]],
  ["Walmart Spark", ["spark", "delivery drivers inc", "ddi "]],
  ["Veho", ["veho"]],
  ["Shipt", ["shipt"]],
  ["Roadie", ["roadie"]],
  ["Gopuff", ["gopuff", "go puff"]],
];

const GENERIC = /^(other|unknown|deposit|credit|payment|n\/?a|income|payout|transfer)$/i;

// Pull a short, human-recognizable source name out of a raw transaction line
// when the AI/keywords can't map it to a known platform. Strips ACH plumbing,
// long ID numbers, and generic words, then keeps the first couple of tokens.
function cleanSource(desc: string): string {
  const s = (desc || "")
    .replace(/\b(ach|deposit|credit|debit|payment|dir(ect)? dep(osit)?|transfer|electronic|des|id|indn|co id|ppd|web|ccd|from|to|ref|trn|memo|xfer|instant|pay(out)?)\b/gi, " ")
    .replace(/[#*:_-]+/g, " ")
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/[^A-Za-z& ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = s.split(" ").filter((w) => w.length > 1).slice(0, 3);
  const name = words.join(" ").trim();
  return name ? name.replace(/\b\w/g, (c) => c.toUpperCase()) : "Unattributed";
}

function matchPlatform(desc: string): string {
  const d = (desc || "").toLowerCase();
  for (const [platform, kws] of PLATFORM_KEYWORDS) for (const kw of kws) if (d.includes(kw)) return platform;
  return cleanSource(desc);
}

export function incomeByPlatform(deposits: ParsedDeposit[], listedPlatformsRaw: string | null): IncomeByPlatform {
  const income = deposits.filter((d) => !d.classification || d.classification === "income");
  const listed = new Set((listedPlatformsRaw || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const map = new Map<string, Map<string, { amount: number; count: number }>>();
  const monthsSet = new Set<string>();
  for (const dep of income) {
    const month = (dep.date || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    monthsSet.add(month);
    // Prefer the payer name the AI attributed (it can read the account type,
    // e.g. an Uber Pro Card statement). Fall back to keyword match, then to a
    // name pulled from the description. Never a bare "Other".
    const aiPlatform = dep.platform?.trim();
    const platform = aiPlatform && !GENERIC.test(aiPlatform) ? aiPlatform : matchPlatform(dep.description);
    if (!map.has(platform)) map.set(platform, new Map());
    const mm = map.get(platform)!;
    const cur = mm.get(month) || { amount: 0, count: 0 };
    cur.amount += dep.amount; cur.count += 1;
    mm.set(month, cur);
  }
  const months = [...monthsSet].sort();
  const platforms = [...map.entries()].map(([platform, mm]) => {
    const byMonth = months.map((m) => ({ month: m, amount: Math.round((mm.get(m)?.amount || 0) * 100) / 100, count: mm.get(m)?.count || 0 }));
    const total = Math.round(byMonth.reduce((s, x) => s + x.amount, 0) * 100) / 100;
    const pl = platform.toLowerCase();
    const isListed = [...listed].some((l) => pl.includes(l) || l.includes(pl));
    return { platform, isListed, total, byMonth };
  }).sort((a, b) => (b.isListed ? 1 : 0) - (a.isListed ? 1 : 0) || b.total - a.total);
  return { months, platforms, grandTotal: Math.round(platforms.reduce((s, p) => s + p.total, 0) * 100) / 100 };
}
