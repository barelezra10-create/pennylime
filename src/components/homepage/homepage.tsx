"use client";

import { Navbar } from "./navbar";
import { Footer } from "./footer";
import { Hero } from "./sections/hero";
import { PainPoints } from "./sections/pain-points";
import { Problem } from "./sections/problem";
import { HowItWorks } from "./sections/how-it-works";
import { PlatformShowcase } from "./sections/platform-showcase";
import { SocialProof } from "./sections/social-proof";
import { WhyLimecredit } from "./sections/why-pennylime";
import { Industries } from "./sections/industries";
import { BlogPreview } from "./sections/blog-preview";
import { HomeFaq } from "./sections/faq";
import { FinalCta } from "./sections/final-cta";

interface HomepageProps {
  latestArticles: {
    title: string;
    slug: string;
    excerpt: string | null;
    featuredImage: string | null;
    publishedAt: string | null;
    categoryName: string | null;
  }[];
  platforms: { name: string; slug: string }[];
}

export function Homepage({ latestArticles, platforms }: HomepageProps) {
  return (
    <>
      <Navbar />
      <main className="pt-20">
        <Hero />
        <PainPoints />
        <Problem />
        <HowItWorks />
        <PlatformShowcase platforms={platforms} />
        <SocialProof />
        <WhyLimecredit />
        <Industries />
        <BlogPreview articles={latestArticles} />
        <HomeFaq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
