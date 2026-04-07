import { notFound } from "next/navigation";
import { getEmailTemplate } from "@/actions/email";
import { TemplateEditorClient } from "../new/template-editor-client";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = await getEmailTemplate(id);
  if (!template) notFound();
  return <TemplateEditorClient template={template} />;
}
