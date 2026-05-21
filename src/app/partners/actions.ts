"use server";

import { redirect } from "next/navigation";
import { signOutPartner } from "@/lib/partner-auth";

export async function signOutPartnerAction() {
  await signOutPartner();
  redirect("/partners/login");
}
