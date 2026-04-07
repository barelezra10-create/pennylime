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
    description: "Fast loans for gig workers. $100 to $10,000.",
    contactPoint: { "@type": "ContactPoint", email: "support@pennylime.com" },
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

export function loanProductSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "LoanOrCredit",
    name: "PennyLime Gig Worker Loan",
    amount: { "@type": "MonetaryAmount", currency: "USD", minValue: 100, maxValue: 10000 },
    annualPercentageRate: { "@type": "QuantitativeValue", minValue: 30, maxValue: 60 },
    loanTerm: { "@type": "QuantitativeValue", minValue: 3, maxValue: 18, unitCode: "MON" },
    provider: { "@type": "Organization", name: "PennyLime" },
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
