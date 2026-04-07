import { getEmailSequences } from "@/actions/email";
import { SequencesClient } from "./sequences-client";

export default async function SequencesPage() {
  const sequences = await getEmailSequences();
  return <SequencesClient sequences={sequences} />;
}
