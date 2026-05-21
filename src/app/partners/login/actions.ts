"use server";

import { redirect } from "next/navigation";
import { signInPartner } from "@/lib/partner-auth";

export async function submitPartnerLogin(_prev: { error: string | null }, form: FormData) {
  const password = (form.get("password") as string) || "";
  const ok = await signInPartner(password);
  if (!ok) {
    return { error: "Wrong password." };
  }
  redirect("/partners");
}
