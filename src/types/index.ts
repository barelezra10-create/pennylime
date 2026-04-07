import type { Application, Document, LoanRule } from "@/generated/prisma/client";

export type ApplicationWithDocuments = Application & { documents: Document[] };

export interface EvaluationResult {
  recommendation: "APPROVE" | "REJECT" | "MANUAL_REVIEW";
  reasons: string[];
  suggestedRate: number;
  rules: Record<string, string>;
  riskScore: RiskScoreResult | null;
}

export interface StorageProvider {
  upload(file: Buffer, filename: string): Promise<string>;
  getUrl(storagePath: string): string;
  delete(storagePath: string): Promise<void>;
}

export interface RiskScoreResult {
  riskScore: number;
  interestRate: number;
  modelId: string | null;
  features: {
    name: string;
    rawValue: number | null;
    normalizedValue: number;
    weight: number;
  }[];
}

// Re-export Prisma types used elsewhere
export type { Document, LoanRule };
