/**
 * Replace {{variable}} placeholders in SMS bodies.
 * Supports: firstName, lastName, fullName, email, phone, loanAmount, applicationCode
 */

export type InterpolationContext = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  loanAmount?: number | null;
  applicationCode?: string | null;
  unsubscribeKeyword?: string;
};

const SUPPORTED = ["firstName", "lastName", "fullName", "email", "phone", "loanAmount", "applicationCode", "unsubscribe"] as const;

export function interpolate(body: string, ctx: InterpolationContext): string {
  return body.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, key: string) => {
    const k = key.trim();
    switch (k) {
      case "firstName":
        return ctx.firstName || "there";
      case "lastName":
        return ctx.lastName || "";
      case "fullName":
        return [ctx.firstName, ctx.lastName].filter(Boolean).join(" ") || "there";
      case "email":
        return ctx.email || "";
      case "phone":
        return ctx.phone || "";
      case "loanAmount":
        return ctx.loanAmount != null ? `$${ctx.loanAmount.toLocaleString()}` : "";
      case "applicationCode":
        return ctx.applicationCode || "";
      case "unsubscribe":
        return ctx.unsubscribeKeyword || "STOP";
      default:
        return `{{${k}}}`;
    }
  });
}

export function listSupportedVariables(): string[] {
  return [...SUPPORTED];
}
