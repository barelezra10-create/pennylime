import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { exchangeCodeAndStore } from "@/lib/google-calendar";

export async function GET(req: NextRequest) {
  const base = process.env.APP_URL || "http://localhost:3000";
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", base));
  }
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  if (error || !code) {
    return NextResponse.redirect(new URL(`/admin/hr?calendar=error`, base));
  }
  try {
    await exchangeCodeAndStore(code);
    return NextResponse.redirect(new URL(`/admin/hr?calendar=connected`, base));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "connect failed";
    return NextResponse.redirect(new URL(`/admin/hr?calendar=error&msg=${encodeURIComponent(msg)}`, base));
  }
}
