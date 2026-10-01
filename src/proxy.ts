import { NextResponse, type NextRequest } from "next/server";
import { checkRequestOrigin } from "@/server/security/csrf";
import { BRAND } from "@/lib/brand";

/**
 * Runs before every API request (Next.js 16 "proxy", formerly middleware).
 * Refuses data-changing requests that don't come from the app's own origin
 * (src/server/security/csrf.ts). Authentication and permissions stay in each
 * route; this only answers "did this request start on our site?".
 */
export function proxy(request: NextRequest) {
  const appOrigin = process.env.NEXTAUTH_URL;
  const result = checkRequestOrigin({
    method: request.method,
    pathname: request.nextUrl.pathname,
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    origin: request.headers.get("origin"),
    referer: request.headers.get("referer"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    allowedOrigins: appOrigin ? [appOrigin] : [],
  });
  if (!result.ok) {
    return NextResponse.json({ error: `This request didn't come from ${BRAND.fullName}, so it was blocked.` }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
