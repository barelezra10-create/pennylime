import { getStatePage } from "@/actions/content";
import { StateEditorClient } from "../new/state-editor-client";
import { notFound } from "next/navigation";

export default async function EditStatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getStatePage(id);
  if (!state) notFound();

  return (
    <StateEditorClient
      state={{
        id: state.id,
        stateName: state.stateName,
        stateCode: state.stateCode,
        slug: state.slug,
        heroHeadline: state.heroHeadline,
        heroSubtext: state.heroSubtext,
        regulationsSummary: state.regulationsSummary || "",
        loanAvailability: state.loanAvailability || "",
        localStats: JSON.parse(state.localStats),
        faqEntries: JSON.parse(state.faqEntries),
        ctaText: state.ctaText || "Apply Now",
        metaTitle: state.metaTitle || "",
        metaDescription: state.metaDescription || "",
        published: state.published,
      }}
    />
  );
}
