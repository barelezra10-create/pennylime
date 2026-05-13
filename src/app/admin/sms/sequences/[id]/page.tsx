import { notFound } from "next/navigation";
import { getSmsSequence } from "@/actions/sms";
import { SmsSequenceEditorClient } from "../new/sequence-editor-client";

export const dynamic = "force-dynamic";

export default async function EditSmsSequencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sequence = await getSmsSequence(id);
  if (!sequence) notFound();
  return <SmsSequenceEditorClient sequence={sequence} />;
}
