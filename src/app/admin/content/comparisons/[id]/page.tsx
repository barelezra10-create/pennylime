import { getComparisonPage } from "@/actions/content";
import { ComparisonEditorClient } from "../new/comparison-editor-client";
import { notFound } from "next/navigation";

export default async function EditComparisonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comp = await getComparisonPage(id);
  if (!comp) notFound();
  return <ComparisonEditorClient comparison={{ id: comp.id, title: comp.title, slug: comp.slug, entityA: comp.entityA, entityB: comp.entityB, introHtml: comp.introHtml || "", comparisonGrid: JSON.parse(comp.comparisonGrid), verdict: comp.verdict || "", faqEntries: JSON.parse(comp.faqEntries), metaTitle: comp.metaTitle || "", metaDescription: comp.metaDescription || "", published: comp.published }} />;
}
