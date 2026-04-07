import { notFound } from "next/navigation";
import { getEmailSequence } from "@/actions/email";
import { SequenceEditorClient } from "../new/sequence-editor-client";

export default async function EditSequencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sequence = await getEmailSequence(id);
  if (!sequence) notFound();
  return <SequenceEditorClient sequence={sequence} />;
}
