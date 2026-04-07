import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/dashboard/:path*",
    "/admin/applications/:path*",
    "/admin/settings/:path*",
    "/admin/audit/:path*",
    "/admin/payments/:path*",
    "/admin/content/:path*",
    "/admin/pipeline/:path*",
    "/admin/contacts/:path*",
    "/admin/abandoned/:path*",
    "/admin/email/:path*",
    "/admin/team/:path*",
  ],
};
