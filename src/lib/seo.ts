const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pennylime.com";
const SITE_NAME = "PennyLime";

export function absoluteUrl(path: string) {
  return `${SITE_URL}${path}`;
}

export function generateMeta({
  title,
  description,
  ogImage,
  canonicalUrl,
  noIndex,
  type = "website",
}: {
  title: string;
  description: string;
  ogImage?: string | null;
  canonicalUrl?: string | null;
  noIndex?: boolean;
  type?: string;
}) {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const meta: Record<string, unknown> = {
    title: fullTitle,
    description,
    openGraph: {
      title: fullTitle,
      description,
      siteName: SITE_NAME,
      type,
      ...(ogImage && { images: [{ url: absoluteUrl(ogImage), width: 1200, height: 630 }] }),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      ...(ogImage && { images: [absoluteUrl(ogImage)] }),
    },
    ...(noIndex && { robots: { index: false, follow: false } }),
    ...(canonicalUrl && { alternates: { canonical: canonicalUrl } }),
  };
  return meta;
}
