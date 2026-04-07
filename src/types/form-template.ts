export interface FormField {
  id: string;
  label: string;
  type: "text" | "number" | "select" | "file" | "checkbox" | "textarea";
  placeholder?: string;
  required: boolean;
  options?: string[];
  order: number;
}

export interface FormStep {
  id: string;
  title: string;
  description: string;
  order: number;
  enabled: boolean;
  type: "builtin" | "custom";
  builtinKey?: "amount" | "info" | "platforms" | "identity" | "bank" | "documents" | "review";
  customFields?: FormField[];
}

export const DEFAULT_STEPS: FormStep[] = [
  { id: "step-amount", title: "Loan Amount", description: "Choose your loan amount and repayment term", order: 0, enabled: true, type: "builtin", builtinKey: "amount" },
  { id: "step-info", title: "Your Info", description: "Tell us about yourself", order: 1, enabled: true, type: "builtin", builtinKey: "info" },
  { id: "step-platforms", title: "Platforms", description: "Select your gig platforms", order: 2, enabled: true, type: "builtin", builtinKey: "platforms" },
  { id: "step-identity", title: "Identity", description: "Upload your photo ID", order: 3, enabled: true, type: "builtin", builtinKey: "identity" },
  { id: "step-bank", title: "Bank Link", description: "Connect your bank account", order: 4, enabled: true, type: "builtin", builtinKey: "bank" },
  { id: "step-documents", title: "Documents", description: "Upload supporting documents", order: 5, enabled: true, type: "builtin", builtinKey: "documents" },
  { id: "step-review", title: "Review", description: "Review and submit your application", order: 6, enabled: true, type: "builtin", builtinKey: "review" },
];
