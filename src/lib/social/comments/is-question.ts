/**
 * Heuristic question detector for short social comments.
 * False-positive bias is acceptable (we'd rather reply to a non-question
 * than miss a real one). False-negative bias on edge cases is fine.
 */
const QUESTION_WORDS = [
  "how", "what", "why", "when", "where", "who", "which",
  "can", "could", "do", "does", "did", "is", "are", "was", "were",
  "will", "would", "should", "may", "might",
  "any", "anybody", "anyone",
];

export function isQuestion(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Explicit question mark anywhere → yes
  if (trimmed.includes("?")) return true;

  // Single line, starts with a question word, has at least 4 words → likely question
  const words = trimmed.toLowerCase().split(/\s+/);
  if (words.length < 3 || words.length > 40) return false;
  const first = words[0].replace(/[^a-z]/g, "");
  if (QUESTION_WORDS.includes(first)) return true;

  return false;
}
