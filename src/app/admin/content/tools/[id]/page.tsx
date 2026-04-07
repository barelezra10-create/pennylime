import { getToolPage } from "@/actions/content";
import { ToolEditorClient } from "../new/tool-editor-client";
import { notFound } from "next/navigation";

export default async function EditToolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tool = await getToolPage(id);
  if (!tool) notFound();
  return <ToolEditorClient tool={{ id: tool.id, title: tool.title, slug: tool.slug, description: tool.description, toolComponent: tool.toolComponent, body: tool.body || "", metaTitle: tool.metaTitle || "", metaDescription: tool.metaDescription || "", published: tool.published }} />;
}
