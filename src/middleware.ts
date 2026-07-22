import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const PENNYCLICK_COOKIE = "_pl_clickid";
const PENNYCLICK_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

const ADMIN_PROTECTED = [
  "/admin/home",
  "/admin/dashboard",
  "/admin/advances",
  "/admin/applications",
  "/admin/calls",
  "/admin/dialer",
  "/admin/settings",
  "/admin/audit",
  "/admin/payments",
  "/admin/content",
  "/admin/pipeline",
  "/admin/pipeline-list",
  "/admin/contacts",
  "/admin/abandoned",
  "/admin/email",
  "/admin/sms",
  "/admin/team",
  "/admin/visitors",
  "/admin/inbox",
  "/admin/chats",
  "/admin/compliance",
  "/admin/goach-test",
  "/admin/funnel-preview",
  "/admin/agent",
  "/admin/social",
  "/admin/tickets",
];

function generatePennyClickId(): string {
  // 16 random bytes -> 22-char base36-ish ID (URL safe, ~96 bits of entropy)
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  let s = "";
  for (const b of arr) s += b.toString(16).padStart(2, "0");
  return `pc_${s}`;
}

function isAdminProtected(pathname: string) {
  return ADMIN_PROTECTED.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Auth gate for /support workspace (any authenticated user; role restriction is enforced in the layout)
  if (pathname.startsWith("/support")) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      url.searchParams.set("callbackUrl", "/support");
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Auth gate for admin pages
  if (isAdminProtected(pathname)) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("callbackUrl", request.url);
      return NextResponse.redirect(loginUrl);
    }
    // SUPPORT-role users may not access admin pages; redirect them to their workspace
    if ((token as { role?: string }).role === "SUPPORT") {
      const url = request.nextUrl.clone();
      url.pathname = "/support";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Funnel preview mode (?preview=1 on /apply) requires admin session.
  // Stops the URL from being shared publicly to bypass Twilio + Plaid.
  if (pathname === "/apply" && searchParams.get("preview") === "1") {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("callbackUrl", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // First-party click ID for everyone (admin and public)
  const existing = request.cookies.get(PENNYCLICK_COOKIE)?.value;
  const response = NextResponse.next();

  if (!existing) {
    const id = generatePennyClickId();
    response.cookies.set(PENNYCLICK_COOKIE, id, {
      httpOnly: false, // client needs to read it
      sameSite: "lax",
      maxAge: PENNYCLICK_TTL_SECONDS,
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
    response.headers.set("x-penny-click", id);
  } else {
    response.headers.set("x-penny-click", existing);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on all paths except static assets, _next internals, and the visit endpoint itself
    "/((?!_next/static|_next/image|favicon|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|css|js|map)$).*)",
  ],
};
