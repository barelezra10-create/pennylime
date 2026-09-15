export type SortValue = string | number | null;
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export function compareTableValues(a: SortValue, b: SortValue, direction: "asc" | "desc") {
  if (a == null || a === "") return b == null || b === "" ? 0 : 1;
  if (b == null || b === "") return -1;
  const result = typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
  return direction === "asc" ? result : -result;
}
export function tableValue(text: string, heading: string): SortValue {
  const value = text.trim();
  if (!value || /^(—|–|-|n\/a|not recorded)$/i.test(value)) return null;
  if (/date|created|updated|due|paid at|sent at|started|ended|scheduled|applied|rejected/i.test(heading) || /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = Date.parse(value);
    if (!Number.isNaN(date)) return date;
  }
  const numeric = value.replace(/[−–]/g, "-").replace(/^\((.*)\)$/, "-$1").replace(/[$,%\s]/g, "");
  if (/^-?\d+(\.\d+)?$/.test(numeric)) return Number(numeric);
  return value;
}
