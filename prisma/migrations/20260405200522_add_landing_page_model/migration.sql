-- CreateTable
CREATE TABLE "LandingPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "metaTitle" TEXT NOT NULL,
    "metaDescription" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "heroBadge" TEXT NOT NULL,
    "heroHeadlineLine1" TEXT NOT NULL,
    "heroHeadlineLine2" TEXT,
    "heroHeadlineLine3" TEXT,
    "heroSubtext" TEXT NOT NULL,
    "heroIllustration" TEXT,
    "trustItems" TEXT NOT NULL DEFAULT '[]',
    "trustStats" TEXT NOT NULL DEFAULT '[]',
    "howItWorksTitle" TEXT NOT NULL DEFAULT 'Three steps. No paperwork.',
    "howItWorksSubtext" TEXT,
    "howItWorksSteps" TEXT NOT NULL DEFAULT '[]',
    "testimonialsTitle" TEXT NOT NULL DEFAULT 'Drivers we''ve funded.',
    "testimonials" TEXT NOT NULL DEFAULT '[]',
    "faqTitle" TEXT NOT NULL DEFAULT 'Common questions.',
    "faqs" TEXT NOT NULL DEFAULT '[]',
    "finalCtaHeadline" TEXT NOT NULL DEFAULT 'Ready to get funded?',
    "finalCtaSubtext" TEXT,
    "finalCtaButtonText" TEXT NOT NULL DEFAULT 'Apply Now',
    "utmSource" TEXT NOT NULL DEFAULT 'lp',
    "utmCampaign" TEXT NOT NULL,
    "formPlatforms" TEXT NOT NULL DEFAULT '[]',
    "defaultAmount" INTEGER NOT NULL DEFAULT 3000,
    "defaultTermWeeks" INTEGER NOT NULL DEFAULT 4,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "LandingPage_slug_key" ON "LandingPage"("slug");

-- CreateIndex
CREATE INDEX "LandingPage_slug_idx" ON "LandingPage"("slug");

-- CreateIndex
CREATE INDEX "LandingPage_published_idx" ON "LandingPage"("published");
