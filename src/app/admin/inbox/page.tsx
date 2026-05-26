import { getInbox, getInboxCounts, type InboxFilter } from "@/actions/inbox";
import { InboxClient } from "./inbox-client";

export const dynamic = "force-dynamic";

const VALID: InboxFilter[] = ["ALL", "UNREAD", "UNMATCHED", "MATCHED", "ARCHIVED"];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const params = await searchParams;
  const requested = (params.filter || "ALL").toUpperCase() as InboxFilter;
  const filter: InboxFilter = VALID.includes(requested) ? requested : "ALL";
  const [rows, counts] = await Promise.all([
    getInbox(filter),
    getInboxCounts(),
  ]);
  return <InboxClient initialRows={rows} counts={counts} filter={filter} />;
}
