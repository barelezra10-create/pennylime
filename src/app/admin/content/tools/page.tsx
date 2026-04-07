import { getToolPages } from "@/actions/content";
import { ToolsClient } from "./tools-client";

export default async function ToolsAdminPage() {
  const tools = await getToolPages();
  return <ToolsClient tools={tools.map((t) => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    toolComponent: t.toolComponent,
    published: t.published,
    updatedAt: t.updatedAt.toISOString(),
  }))} />;
}
