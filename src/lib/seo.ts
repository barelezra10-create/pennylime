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
  path,
  noIndex,
  type = "website",
}: {
  title: string;
  description: string;
  ogImage?: string | null;
  /** Absolute canonical URL. If omitted, derived from `path`. */
  canonicalUrl?: string | null;
  /** Page path (e.g. "/blog/some-slug"). Used to auto-build canonical. */
  path?: string;
  noIndex?: boolean;
  type?: string;
}) {
  // Strip trailing " | PennyLime" if the caller (or DB) included it, then
  // append exactly once. Return as { absolute } so the root layout's
  // `%s | PennyLime` template doesn't append a second time.
  const cleanTitle = title.replace(/\s*[|—-]\s*PennyLime\s*$/i, "").trim();
  const fullTitle = `${cleanTitle} | ${SITE_NAME}`;
  const canonical = canonicalUrl ?? (path ? absoluteUrl(path) : null);
  const meta: Record<string, unknown> = {
    title: { absolute: fullTitle },
    description,
    openGraph: {
      title: fullTitle,
      description,
      siteName: SITE_NAME,
      type,
      ...(canonical && { url: canonical }),
      ...(ogImage && { images: [{ url: absoluteUrl(ogImage), width: 1200, height: 630 }] }),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      ...(ogImage && { images: [absoluteUrl(ogImage)] }),
    },
    ...(noIndex && { robots: { index: false, follow: false } }),
    ...(canonical && { alternates: { canonical } }),
  };
  return meta;
}
