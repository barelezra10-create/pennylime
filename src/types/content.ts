export interface FaqEntry {
  question: string;
  answer: string;
}

export interface LocalStat {
  label: string;
  value: string;
}

export interface ComparisonRow {
  feature: string;
  entityAValue: string;
  entityBValue: string;
}

export interface SeoFields {
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  canonicalUrl: string | null;
  noIndex: boolean;
}
