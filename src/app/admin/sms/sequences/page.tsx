import { getSmsSequences } from "@/actions/sms";
import { SmsSequencesClient } from "./sequences-client";

export const dynamic = "force-dynamic";

export default async function SmsSequencesPage() {
  const sequences = await getSmsSequences();
  return <SmsSequencesClient sequences={sequences} />;
}
