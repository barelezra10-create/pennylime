// Pure builder for the call-run queue order.

export type QueueContact = { id: string; stage: string; phone: string | null };

/**
 * Default run: LATE stage first, then REPAYING. When the agent has an
 * active search/stage filter, the run is their filtered list in display
 * order instead. Contacts without phones are always skipped.
 */
export function buildCallQueue<T extends QueueContact>(
  all: T[],
  filterActive: boolean,
  filteredList: T[]
): T[] {
  const source = filterActive
    ? filteredList
    : [...all.filter((c) => c.stage === "LATE"), ...all.filter((c) => c.stage === "REPAYING")];
  return source.filter((c) => !!c.phone);
}
