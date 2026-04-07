import { getLoanRulesAction } from "@/actions/settings";
import { SettingsClient } from "./settings-client";
import type { LoanRule } from "@/types";

export default async function AdminSettingsPage() {
  const rules = (await getLoanRulesAction()) as LoanRule[];

  return <SettingsClient rules={rules} />;
}
