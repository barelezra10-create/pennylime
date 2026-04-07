import { notFound } from "next/navigation";
import { getEmailCampaign } from "@/actions/email";
import { CampaignEditorClient } from "../new/campaign-editor-client";

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getEmailCampaign(id);
  if (!campaign) notFound();
  return <CampaignEditorClient campaign={campaign} />;
}
