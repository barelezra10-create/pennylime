export interface SegmentRule {
  field: "stage" | "tag" | "source" | "utmCampaign" | "assignedRepId" | "lastAppStep" | "createdAt";
  operator: "is" | "is_not" | "contains" | "gt" | "lt";
  value: string;
}

export interface SequenceStep {
  id: string;
  order: number;
  subject: string;
  body: string;
  delayAmount: number;
  delayUnit: "hours" | "days";
}
