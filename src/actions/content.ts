"use server";

import { prisma } from "@/lib/db";

// ─── Categories ─────────────────────────────────────────────

export async function getCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

export async function createCategory(data: { name: string; slug: string; description?: string }) {
  return prisma.category.create({ data });
}

export async function updateCategory(id: string, data: { name?: string; slug?: string; description?: string }) {
  return prisma.category.update({ where: { id }, data });
}

export async function deleteCategory(id: string) {
  return prisma.category.delete({ where: { id } });
}

// ─── Tags ───────────────────────────────────────────────────

export async function getTags() {
  return prisma.tag.findMany({ orderBy: { name: "asc" } });
}

export async function createTag(data: { name: string; slug: string }) {
  return prisma.tag.create({ data });
}

export async function deleteTag(id: string) {
  await prisma.articleTag.deleteMany({ where: { tagId: id } });
  return prisma.tag.delete({ where: { id } });
}

// ─── Articles ───────────────────────────────────────────────

export async function getArticles() {
  return prisma.article.findMany({
    include: { category: true, tags: { include: { tag: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getArticle(id: string) {
  return prisma.article.findUnique({
    where: { id },
    include: { category: true, tags: { include: { tag: true } } },
  });
}

export async function getArticleBySlug(slug: string) {
  return prisma.article.findUnique({
    where: { slug },
    include: { category: true, tags: { include: { tag: true } } },
  });
}

export async function getPublishedArticles(categorySlug?: string, page = 1, perPage = 12) {
  const where: Record<string, unknown> = { published: true };
  if (categorySlug) {
    where.category = { slug: categorySlug };
  }
  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      include: { category: true, tags: { include: { tag: true } } },
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.article.count({ where }),
  ]);
  return { articles, total, totalPages: Math.ceil(total / perPage) };
}

export async function createArticle(data: {
  title: string;
  slug: string;
  body: string;
  excerpt?: string;
  featuredImage?: string;
  categoryId?: string;
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  published?: boolean;
  publishedAt?: string;
  tagIds?: string[];
}) {
  const { tagIds, publishedAt, ...rest } = data;
  const article = await prisma.article.create({
    data: {
      ...rest,
      publishedAt: publishedAt ? new Date(publishedAt) : data.published ? new Date() : null,
    },
  });
  if (tagIds?.length) {
    await prisma.articleTag.createMany({
      data: tagIds.map((tagId) => ({ articleId: article.id, tagId })),
    });
  }
  return article;
}

export async function updateArticle(
  id: string,
  data: {
    title?: string;
    slug?: string;
    body?: string;
    excerpt?: string;
    featuredImage?: string;
    categoryId?: string | null;
    metaTitle?: string;
    metaDescription?: string;
    ogImage?: string;
    published?: boolean;
    publishedAt?: string;
    tagIds?: string[];
  }
) {
  const { tagIds, publishedAt, ...rest } = data;
  const updateData: Record<string, unknown> = { ...rest };
  if (publishedAt !== undefined) {
    updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
  }
  const article = await prisma.article.update({ where: { id }, data: updateData });
  if (tagIds !== undefined) {
    await prisma.articleTag.deleteMany({ where: { articleId: id } });
    if (tagIds.length) {
      await prisma.articleTag.createMany({
        data: tagIds.map((tagId) => ({ articleId: id, tagId })),
      });
    }
  }
  return article;
}

export async function deleteArticle(id: string) {
  return prisma.article.delete({ where: { id } });
}

// ─── Platform Pages ─────────────────────────────────────────

export async function getPlatformPages() {
  return prisma.platformPage.findMany({ orderBy: { platformName: "asc" } });
}

export async function getPlatformPage(id: string) {
  return prisma.platformPage.findUnique({ where: { id } });
}

export async function getPlatformPageBySlug(slug: string) {
  return prisma.platformPage.findUnique({ where: { slug } });
}

export async function getPublishedPlatformPages() {
  return prisma.platformPage.findMany({ where: { published: true }, orderBy: { platformName: "asc" } });
}

export async function createPlatformPage(data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  return prisma.platformPage.create({
    data: {
      ...rest,
      publishedAt: publishedAt ? new Date(publishedAt) : (rest.published ? new Date() : null),
    } as never,
  });
}

export async function updatePlatformPage(id: string, data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  const updateData = { ...rest } as Record<string, unknown>;
  if (publishedAt !== undefined) {
    updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
  }
  return prisma.platformPage.update({ where: { id }, data: updateData as never });
}

export async function deletePlatformPage(id: string) {
  return prisma.platformPage.delete({ where: { id } });
}

// ─── State Pages ────────────────────────────────────────────

export async function getStatePages() {
  return prisma.statePage.findMany({ orderBy: { stateName: "asc" } });
}

export async function getStatePage(id: string) {
  return prisma.statePage.findUnique({ where: { id } });
}

export async function getStatePageBySlug(slug: string) {
  return prisma.statePage.findUnique({ where: { slug } });
}

export async function getPublishedStatePages() {
  return prisma.statePage.findMany({ where: { published: true }, orderBy: { stateName: "asc" } });
}

export async function createStatePage(data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  return prisma.statePage.create({
    data: {
      ...rest,
      publishedAt: publishedAt ? new Date(publishedAt) : (rest.published ? new Date() : null),
    } as never,
  });
}

export async function updateStatePage(id: string, data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  const updateData = { ...rest } as Record<string, unknown>;
  if (publishedAt !== undefined) {
    updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
  }
  return prisma.statePage.update({ where: { id }, data: updateData as never });
}

export async function deleteStatePage(id: string) {
  return prisma.statePage.delete({ where: { id } });
}

// ─── Tool Pages ─────────────────────────────────────────────

export async function getToolPages() {
  return prisma.toolPage.findMany({ orderBy: { title: "asc" } });
}

export async function getToolPage(id: string) {
  return prisma.toolPage.findUnique({ where: { id } });
}

export async function getToolPageBySlug(slug: string) {
  return prisma.toolPage.findUnique({ where: { slug } });
}

export async function getPublishedToolPages() {
  return prisma.toolPage.findMany({ where: { published: true }, orderBy: { title: "asc" } });
}

export async function createToolPage(data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  return prisma.toolPage.create({
    data: {
      ...rest,
      publishedAt: publishedAt ? new Date(publishedAt) : (rest.published ? new Date() : null),
    } as never,
  });
}

export async function updateToolPage(id: string, data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  const updateData = { ...rest } as Record<string, unknown>;
  if (publishedAt !== undefined) {
    updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
  }
  return prisma.toolPage.update({ where: { id }, data: updateData as never });
}

export async function deleteToolPage(id: string) {
  return prisma.toolPage.delete({ where: { id } });
}

// ─── Comparison Pages ───────────────────────────────────────

export async function getComparisonPages() {
  return prisma.comparisonPage.findMany({ orderBy: { title: "asc" } });
}

export async function getComparisonPage(id: string) {
  return prisma.comparisonPage.findUnique({ where: { id } });
}

export async function getComparisonPageBySlug(slug: string) {
  return prisma.comparisonPage.findUnique({ where: { slug } });
}

export async function getPublishedComparisonPages() {
  return prisma.comparisonPage.findMany({ where: { published: true }, orderBy: { title: "asc" } });
}

export async function createComparisonPage(data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  return prisma.comparisonPage.create({
    data: {
      ...rest,
      publishedAt: publishedAt ? new Date(publishedAt) : (rest.published ? new Date() : null),
    } as never,
  });
}

export async function updateComparisonPage(id: string, data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  const updateData = { ...rest } as Record<string, unknown>;
  if (publishedAt !== undefined) {
    updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
  }
  return prisma.comparisonPage.update({ where: { id }, data: updateData as never });
}

export async function deleteComparisonPage(id: string) {
  return prisma.comparisonPage.delete({ where: { id } });
}

// ─── Landing Pages ──────────────────────────────────────────

export async function getLandingPages() {
  return prisma.landingPage.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getLandingPage(id: string) {
  return prisma.landingPage.findUnique({ where: { id } });
}

export async function getLandingPageBySlug(slug: string) {
  return prisma.landingPage.findUnique({ where: { slug } });
}

export async function getPublishedLandingPages() {
  return prisma.landingPage.findMany({ where: { published: true }, orderBy: { createdAt: "desc" } });
}

export async function createLandingPage(data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  return prisma.landingPage.create({
    data: {
      ...rest,
      publishedAt: publishedAt ? new Date(publishedAt) : (rest.published ? new Date() : null),
    } as never,
  });
}

export async function updateLandingPage(id: string, data: Record<string, unknown>) {
  const { publishedAt, ...rest } = data as Record<string, unknown> & { publishedAt?: string };
  const updateData = { ...rest } as Record<string, unknown>;
  if (publishedAt !== undefined) {
    updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
  }
  return prisma.landingPage.update({ where: { id }, data: updateData as never });
}

export async function deleteLandingPage(id: string) {
  return prisma.landingPage.delete({ where: { id } });
}

// ─── Content Images ─────────────────────────────────────────

export async function getContentImages() {
  return prisma.contentImage.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createContentImage(data: {
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  altText?: string;
}) {
  return prisma.contentImage.create({ data });
}

export async function updateContentImageAlt(id: string, altText: string) {
  return prisma.contentImage.update({ where: { id }, data: { altText } });
}

export async function deleteContentImage(id: string) {
  return prisma.contentImage.delete({ where: { id } });
}
