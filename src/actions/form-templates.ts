"use server";

import { prisma } from "@/lib/db";

export async function getFormTemplates() {
  return prisma.formTemplate.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getFormTemplate(id: string) {
  return prisma.formTemplate.findUnique({ where: { id } });
}

export async function getFormTemplateBySlug(slug: string) {
  return prisma.formTemplate.findUnique({ where: { slug } });
}

export async function getDefaultFormTemplate() {
  return prisma.formTemplate.findFirst({ where: { isDefault: true } });
}

export async function createFormTemplate(data: {
  name: string;
  slug: string;
  description?: string;
  steps: string;
  isDefault?: boolean;
  published?: boolean;
}) {
  // If setting as default, unset any existing default
  if (data.isDefault) {
    await prisma.formTemplate.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }
  return prisma.formTemplate.create({ data });
}

export async function updateFormTemplate(
  id: string,
  data: {
    name?: string;
    slug?: string;
    description?: string;
    steps?: string;
    isDefault?: boolean;
    published?: boolean;
  }
) {
  if (data.isDefault) {
    await prisma.formTemplate.updateMany({
      where: { isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }
  return prisma.formTemplate.update({ where: { id }, data });
}

export async function deleteFormTemplate(id: string) {
  return prisma.formTemplate.delete({ where: { id } });
}
