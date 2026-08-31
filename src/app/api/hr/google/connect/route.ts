import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { consentUrl, googleConfigured } from "@/lib/google-calendar";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", process.env.APP_URL || "http://localhost:3000"));
  }
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/admin/hr?calendar=notconfigured", process.env.APP_URL || "http://localhost:3000"));
  }
  return NextResponse.redirect(consentUrl());
}
