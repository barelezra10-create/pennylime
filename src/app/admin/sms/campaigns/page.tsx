import { getSmsCampaigns } from "@/actions/sms";
import { SmsCampaignsClient } from "./campaigns-client";

export const dynamic = "force-dynamic";

export default async function SmsCampaignsPage() {
  const campaigns = await getSmsCampaigns();
  return <SmsCampaignsClient campaigns={campaigns} />;
}
