import { getFormTemplate } from "@/actions/form-templates";
import { FormTemplateEditorClient } from "../new/form-template-editor-client";
import { notFound } from "next/navigation";
import type { FormStep } from "@/types/form-template";

export default async function EditFormTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const template = await getFormTemplate(id);
  if (!template) notFound();

  return (
    <FormTemplateEditorClient
      template={{
        id: template.id,
        name: template.name,
        slug: template.slug,
        description: template.description || "",
        steps: JSON.parse(template.steps) as FormStep[],
        isDefault: template.isDefault,
        published: template.published,
      }}
    />
  );
}
