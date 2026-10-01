import { NextResponse, type NextRequest } from "next/server";
import { checkRequestOrigin } from "@/server/security/csrf";
import { buildContentSecurityPolicy, createNonce } from "@/server/security/csp";
import { BRAND } from "@/lib/brand";

/**
 * Runs before API requests and page requests (Next.js 16 "proxy", formerly
 * middleware). It never decides who may do what; authentication and
 * permissions stay in each route and page.
 * - API: refuses data-changing requests that don't come from the app's own
 *   origin (src/server/security/csrf.ts).
 * - Pages: a per-request nonce and the Content-Security-Policy that uses it
 *   (src/server/security/csp.ts). Production only, so it never fights
 *   next dev's hot reload.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) return checkApiOrigin(request);
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const nonce = createNonce();
  const policy = buildContentSecurityPolicy(nonce);
  // Next.js reads the nonce from the request's CSP header and puts it on its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

function checkApiOrigin(request: NextRequest) {
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
  matcher: [
    "/api/:path*",
    // Pages, but not static files (build output, icons, images, the service
    // worker, the manifest/robots/sitemap) or next/link prefetches, which
    // don't render HTML of their own.
    {
      source: "/((?!api/|_next/static|_next/image|assets/|icons/|og/|mediapipe/|sw\\.js|offline\\.html|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|icon\\.png|apple-icon\\.png|favicon\\.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
