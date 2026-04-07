import { getPlatformPage } from "@/actions/content";
import { PlatformEditorClient } from "../new/platform-editor-client";
import { notFound } from "next/navigation";
import type { FaqEntry } from "@/types/content";

export default async function EditPlatformPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const platform = await getPlatformPage(id);
  if (!platform) notFound();

  return (
    <PlatformEditorClient
      platform={{
        id: platform.id,
        platformName: platform.platformName,
        slug: platform.slug,
        heroHeadline: platform.heroHeadline,
        heroSubtext: platform.heroSubtext,
        platformDescription: platform.platformDescription,
        avgEarnings: platform.avgEarnings || "",
        topEarnerRange: platform.topEarnerRange || "",
        loanDetailsHtml: platform.loanDetailsHtml || "",
        faqEntries: JSON.parse(platform.faqEntries) as FaqEntry[],
        ctaText: platform.ctaText || "Apply Now",
        ctaSubtext: platform.ctaSubtext || "",
        metaTitle: platform.metaTitle || "",
        metaDescription: platform.metaDescription || "",
        published: platform.published,
      }}
    />
  );
}
