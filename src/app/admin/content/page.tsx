import { getArticles, getPlatformPages, getStatePages, getToolPages, getComparisonPages, getLandingPages } from "@/actions/content";
import { getFormTemplates } from "@/actions/form-templates";
import { ContentDashboardClient } from "./content-dashboard-client";

export default async function ContentDashboardPage() {
  const [articles, platforms, states, tools, comparisons, landingPages, formTemplates] = await Promise.all([
    getArticles(),
    getPlatformPages(),
    getStatePages(),
    getToolPages(),
    getComparisonPages(),
    getLandingPages(),
    getFormTemplates(),
  ]);

  return (
    <ContentDashboardClient
      counts={{
        articles: articles.length,
        platforms: platforms.length,
        states: states.length,
        tools: tools.length,
        comparisons: comparisons.length,
        landingPages: landingPages.length,
        formTemplates: formTemplates.length,
        published: [
          ...articles.filter((a) => a.published),
          ...platforms.filter((p) => p.published),
          ...states.filter((s) => s.published),
          ...tools.filter((t) => t.published),
          ...comparisons.filter((c) => c.published),
          ...landingPages.filter((lp) => lp.published),
        ].length,
      }}
    />
  );
}
