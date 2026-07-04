import { PageHeader } from "@/components/admin/page-header";
import { ChatsClient } from "./chats-client";

export const dynamic = "force-dynamic";

export default function ChatsPage() {
  return (
    <div>
      <PageHeader title="Chats" description="Read and answer visitor conversations" />
      <ChatsClient />
    </div>
  );
}
