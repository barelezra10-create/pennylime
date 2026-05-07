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
  builtinKey?: "amount" | "info" | "platforms" | "bank" | "verified" | "review";
  customFields?: FormField[];
}

export const DEFAULT_STEPS: FormStep[] = [
  { id: "step-amount", title: "Loan Amount", description: "Choose your loan amount and repayment term", order: 0, enabled: true, type: "builtin", builtinKey: "amount" },
  { id: "step-info", title: "Your Info", description: "Tell us about yourself", order: 1, enabled: true, type: "builtin", builtinKey: "info" },
  { id: "step-platforms", title: "Platforms", description: "Select your gig platforms", order: 2, enabled: true, type: "builtin", builtinKey: "platforms" },
  { id: "step-bank", title: "Bank Link", description: "Connect your bank account", order: 3, enabled: true, type: "builtin", builtinKey: "bank" },
  { id: "step-verified", title: "Verified", description: "We confirm your identity from your bank", order: 4, enabled: true, type: "builtin", builtinKey: "verified" },
  { id: "step-review", title: "Review", description: "Review and submit your application", order: 5, enabled: true, type: "builtin", builtinKey: "review" },
];
