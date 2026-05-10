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
  builtinKey?: "amount" | "email" | "phone" | "workerType" | "details" | "ssn" | "platforms" | "bank" | "classify" | "verified" | "review";
  customFields?: FormField[];
}

export const DEFAULT_STEPS: FormStep[] = [
  { id: "step-amount", title: "Amount", description: "Choose your loan amount and repayment term", order: 0, enabled: true, type: "builtin", builtinKey: "amount" },
  { id: "step-email", title: "Email", description: "We'll send your application status here", order: 1, enabled: true, type: "builtin", builtinKey: "email" },
  { id: "step-phone", title: "Phone", description: "We'll send a verification code to this number", order: 2, enabled: true, type: "builtin", builtinKey: "phone" },
  { id: "step-workertype", title: "About you", description: "How do you earn your income?", order: 3, enabled: true, type: "builtin", builtinKey: "workerType" },
  { id: "step-details", title: "Your details", description: "Tell us about yourself", order: 4, enabled: true, type: "builtin", builtinKey: "details" },
  { id: "step-ssn", title: "SSN", description: "Identity verification", order: 5, enabled: true, type: "builtin", builtinKey: "ssn" },
  { id: "step-platforms", title: "Platforms", description: "Select your gig platforms", order: 6, enabled: true, type: "builtin", builtinKey: "platforms" },
  { id: "step-bank", title: "Bank link", description: "Connect your bank account", order: 7, enabled: true, type: "builtin", builtinKey: "bank" },
  { id: "step-classify", title: "Classify", description: "Classify your transactions", order: 8, enabled: true, type: "builtin", builtinKey: "classify" },
  { id: "step-verified", title: "Verified", description: "We confirm your identity from your bank", order: 9, enabled: true, type: "builtin", builtinKey: "verified" },
  { id: "step-review", title: "Review", description: "Review and submit your application", order: 10, enabled: true, type: "builtin", builtinKey: "review" },
];
