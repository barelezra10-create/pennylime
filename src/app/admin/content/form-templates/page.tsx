import { getFormTemplates } from "@/actions/form-templates";
import { FormTemplatesClient } from "./form-templates-client";

export default async function FormTemplatesPage() {
  const templates = await getFormTemplates();
  return (
    <FormTemplatesClient
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        isDefault: t.isDefault,
        published: t.published,
        stepCount: JSON.parse(t.steps).filter((s: { enabled: boolean }) => s.enabled).length,
        updatedAt: t.updatedAt.toISOString(),
      }))}
    />
  );
}
