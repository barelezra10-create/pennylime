import { getEmailTemplates } from "@/actions/email";
import { TemplatesClient } from "./templates-client";

export default async function TemplatesPage() {
  const templates = await getEmailTemplates();
  return <TemplatesClient templates={templates} />;
}
