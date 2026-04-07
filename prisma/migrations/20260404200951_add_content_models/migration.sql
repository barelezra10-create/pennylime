-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ArticleTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "ArticleTag_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArticleTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "excerpt" TEXT,
    "featuredImage" TEXT,
    "categoryId" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImage" TEXT,
    "canonicalUrl" TEXT,
    "noIndex" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Article_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlatformPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platformName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "heroHeadline" TEXT NOT NULL,
    "heroSubtext" TEXT NOT NULL,
    "platformDescription" TEXT NOT NULL,
    "avgEarnings" TEXT,
    "topEarnerRange" TEXT,
    "loanDetailsHtml" TEXT,
    "faqEntries" TEXT NOT NULL DEFAULT '[]',
    "ctaText" TEXT,
    "ctaSubtext" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImage" TEXT,
    "canonicalUrl" TEXT,
    "noIndex" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StatePage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stateName" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "heroHeadline" TEXT NOT NULL,
    "heroSubtext" TEXT NOT NULL,
    "regulationsSummary" TEXT,
    "loanAvailability" TEXT,
    "localStats" TEXT NOT NULL DEFAULT '[]',
    "faqEntries" TEXT NOT NULL DEFAULT '[]',
    "ctaText" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImage" TEXT,
    "canonicalUrl" TEXT,
    "noIndex" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ToolPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "toolComponent" TEXT NOT NULL,
    "body" TEXT,
    "relatedArticleSlugs" TEXT NOT NULL DEFAULT '[]',
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImage" TEXT,
    "canonicalUrl" TEXT,
    "noIndex" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ComparisonPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "entityA" TEXT NOT NULL,
    "entityB" TEXT NOT NULL,
    "introHtml" TEXT,
    "comparisonGrid" TEXT NOT NULL DEFAULT '[]',
    "verdict" TEXT,
    "faqEntries" TEXT NOT NULL DEFAULT '[]',
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogImage" TEXT,
    "canonicalUrl" TEXT,
    "noIndex" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContentImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "altText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_slug_idx" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Tag_slug_idx" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "ArticleTag_articleId_idx" ON "ArticleTag"("articleId");

-- CreateIndex
CREATE INDEX "ArticleTag_tagId_idx" ON "ArticleTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleTag_articleId_tagId_key" ON "ArticleTag"("articleId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_slug_idx" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_published_idx" ON "Article"("published");

-- CreateIndex
CREATE INDEX "Article_categoryId_idx" ON "Article"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPage_platformName_key" ON "PlatformPage"("platformName");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPage_slug_key" ON "PlatformPage"("slug");

-- CreateIndex
CREATE INDEX "PlatformPage_slug_idx" ON "PlatformPage"("slug");

-- CreateIndex
CREATE INDEX "PlatformPage_published_idx" ON "PlatformPage"("published");

-- CreateIndex
CREATE UNIQUE INDEX "StatePage_stateName_key" ON "StatePage"("stateName");

-- CreateIndex
CREATE UNIQUE INDEX "StatePage_stateCode_key" ON "StatePage"("stateCode");

-- CreateIndex
CREATE UNIQUE INDEX "StatePage_slug_key" ON "StatePage"("slug");

-- CreateIndex
CREATE INDEX "StatePage_slug_idx" ON "StatePage"("slug");

-- CreateIndex
CREATE INDEX "StatePage_published_idx" ON "StatePage"("published");

-- CreateIndex
CREATE UNIQUE INDEX "ToolPage_slug_key" ON "ToolPage"("slug");

-- CreateIndex
CREATE INDEX "ToolPage_slug_idx" ON "ToolPage"("slug");

-- CreateIndex
CREATE INDEX "ToolPage_published_idx" ON "ToolPage"("published");

-- CreateIndex
CREATE UNIQUE INDEX "ComparisonPage_slug_key" ON "ComparisonPage"("slug");

-- CreateIndex
CREATE INDEX "ComparisonPage_slug_idx" ON "ComparisonPage"("slug");

-- CreateIndex
CREATE INDEX "ComparisonPage_published_idx" ON "ComparisonPage"("published");
