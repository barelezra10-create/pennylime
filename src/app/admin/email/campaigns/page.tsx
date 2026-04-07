import { getEmailCampaigns } from "@/actions/email";
import { CampaignsClient } from "./campaigns-client";

export default async function CampaignsPage() {
  const campaigns = await getEmailCampaigns();
  return <CampaignsClient campaigns={campaigns} />;
}
