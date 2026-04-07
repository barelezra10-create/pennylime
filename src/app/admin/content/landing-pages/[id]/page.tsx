import { notFound } from "next/navigation";
import { getLandingPage } from "@/actions/content";
import { LandingPageEditorClient } from "../new/landing-page-editor-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditLandingPagePage({ params }: Props) {
  const { id } = await params;
  const page = await getLandingPage(id);
  if (!page) notFound();

  return (
    <LandingPageEditorClient
      page={{
        id: page.id,
        slug: page.slug,
        metaTitle: page.metaTitle,
        metaDescription: page.metaDescription,
        phoneNumber: page.phoneNumber ?? "",
        heroBadge: page.heroBadge,
        heroHeadlineLine1: page.heroHeadlineLine1,
        heroHeadlineLine2: page.heroHeadlineLine2 ?? "",
        heroHeadlineLine3: page.heroHeadlineLine3 ?? "",
        heroSubtext: page.heroSubtext,
        heroIllustration: page.heroIllustration ?? "",
        trustItems: page.trustItems,
        trustStats: page.trustStats,
        howItWorksTitle: page.howItWorksTitle,
        howItWorksSubtext: page.howItWorksSubtext ?? "",
        howItWorksSteps: page.howItWorksSteps,
        testimonialsTitle: page.testimonialsTitle,
        testimonials: page.testimonials,
        faqTitle: page.faqTitle,
        faqs: page.faqs,
        finalCtaHeadline: page.finalCtaHeadline,
        finalCtaSubtext: page.finalCtaSubtext ?? "",
        finalCtaButtonText: page.finalCtaButtonText,
        utmSource: page.utmSource,
        utmCampaign: page.utmCampaign,
        formPlatforms: page.formPlatforms,
        defaultAmount: page.defaultAmount,
        defaultTermWeeks: page.defaultTermWeeks,
        published: page.published,
      }}
    />
  );
}
