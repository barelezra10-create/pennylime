import { notFound } from "next/navigation";
import { getSmsCampaign } from "@/actions/sms";
import { SmsCampaignEditorClient } from "../new/campaign-editor-client";

export const dynamic = "force-dynamic";

export default async function EditSmsCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getSmsCampaign(id);
  if (!campaign) notFound();
  return <SmsCampaignEditorClient campaign={campaign} />;
}
