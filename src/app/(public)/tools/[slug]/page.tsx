export const dynamic = "force-dynamic";

import { getToolPageBySlug, getPublishedToolPages } from "@/actions/content";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { ContentCta } from "@/components/content/content-cta";
import { generateMeta } from "@/lib/seo";
import type { Metadata } from "next";
import dynamicImport from "next/dynamic";

const toolComponents: Record<string, React.ComponentType | undefined> = {
  "loan-calculator": dynamicImport(() =>
    import("@/components/tools/loan-calculator").then((m) => m.LoanCalculator)
  ),
  "income-estimator": dynamicImport(() =>
    import("@/components/tools/income-estimator").then((m) => m.IncomeEstimator)
  ),
  "loan-comparison": dynamicImport(() =>
    import("@/components/tools/loan-comparison").then((m) => m.LoanComparison)
  ),
  "dti-calculator": dynamicImport(() =>
    import("@/components/tools/dti-calculator").then((m) => m.DtiCalculator)
  ),
  "tax-estimator": dynamicImport(() =>
    import("@/components/tools/tax-estimator").then((m) => m.TaxEstimator)
  ),
};

export async function generateStaticParams() {
  const tools = await getPublishedToolPages();
  return tools.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tool = await getToolPageBySlug(slug);
  if (!tool) return {};
  return generateMeta({ title: tool.metaTitle || tool.title, description: tool.metaDescription || tool.description }) as Metadata;
}

export default async function ToolPageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = await getToolPageBySlug(slug);
  if (!tool || !tool.published) notFound();

  const ToolComponent = toolComponents[tool.toolComponent];

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Tools", href: "/tools/loan-calculator" }, { label: tool.title, href: `/tools/${tool.slug}` }]} />
      <h1 className="text-[32px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-2">{tool.title}</h1>
      <p className="text-[14px] text-[#71717a] mb-8">{tool.description}</p>
      {ToolComponent ? (
        <ToolComponent />
      ) : (
        <div className="bg-white rounded-[10px] p-8 text-center text-[#71717a]">Tool coming soon</div>
      )}
      {tool.body && <div className="mt-8 prose max-w-none" dangerouslySetInnerHTML={{ __html: tool.body }} />}
      <ContentCta />
    </div>
  );
}