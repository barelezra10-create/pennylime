export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "PennyLime",
    url: "https://pennylime.com",
    description: "Fast cash advances for gig workers. $500 to $10,000.",
    contactPoint: { "@type": "ContactPoint", email: "info@pennylime.com" },
  };
}

export function articleSchema(article: {
  title: string;
  slug: string;
  excerpt?: string | null;
  publishedAt?: Date | null;
  updatedAt: Date;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    url: `https://pennylime.com/blog/${article.slug}`,
    ...(article.excerpt && { description: article.excerpt }),
    ...(article.publishedAt && { datePublished: article.publishedAt.toISOString() }),
    dateModified: article.updatedAt.toISOString(),
    publisher: { "@type": "Organization", name: "PennyLime" },
  };
}

export function faqSchema(entries: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((e) => ({
      "@type": "Question",
      name: e.question,
      acceptedAnswer: { "@type": "Answer", text: e.answer },
    })),
  };
}

export function cashAdvanceProductSchema(options?: { platformName?: string; pageUrl?: string }) {
  const baseDescription =
    "Cash advance for gig workers, 1099 contractors, and small businesses. PennyLime purchases a portion of your future receivables and delivers funds in as fast as 24 hours, with repayment as a fixed weekly remittance.";
  return {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: options?.platformName
      ? `PennyLime Cash Advance for ${options.platformName} Workers`
      : "PennyLime Cash Advance",
    description: options?.platformName
      ? `Cash advance for ${options.platformName} workers. ${baseDescription}`
      : baseDescription,
    url: options?.pageUrl,
    amount: { "@type": "MonetaryAmount", currency: "USD", minValue: 500, maxValue: 10000 },
    feesAndCommissionsSpecification:
      "Weekly compound rate of 3% to 7% based on risk assessment. No origination fees, no prepayment penalty.",
    areaServed: { "@type": "Country", name: "United States" },
    audience: options?.platformName
      ? { "@type": "BusinessAudience", audienceType: `${options.platformName} gig workers` }
      : { "@type": "BusinessAudience", audienceType: "Gig economy workers and 1099 contractors" },
    provider: {
      "@type": "Organization",
      name: "PennyLime",
      url: "https://pennylime.com",
      logo: "https://pennylime.com/lime-mark-512.png",
      legalName: "770 Technology LLC",
    },
  };
}

/**
 * Schema for the /cash-advance hub: tells Google that this page is a
 * structured directory of related Service offerings (one per platform).
 */
export function platformItemListSchema(platforms: { platformName: string; slug: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Cash advances for gig workers — supported platforms",
    numberOfItems: platforms.length,
    itemListElement: platforms.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${p.platformName} cash advance`,
      url: `https://pennylime.com/cash-advance/${p.slug}`,
    })),
  };
}


export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
