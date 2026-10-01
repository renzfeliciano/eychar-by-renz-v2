import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// The page Content-Security-Policy is set per request with a nonce in
// src/proxy.ts (src/server/security/csp.ts), not here: a static header can't
// carry a fresh nonce, and two CSP headers would both apply.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // camera/geolocation must be `(self)`, not `()` — the empty list disables
  // them for this app's own pages too, which silently broke the self-service
  // clock's photo and GPS capture (getUserMedia/getCurrentPosition just fail).
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
  // HTTPS only, so only in production (it would pin localhost to https in dev).
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
  // Cross-origin isolation of the window (popups can't keep a handle on it).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework in every response.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API responses are never search results, even if a URL leaks.
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      // The service worker must never be served from a cache, or clients
      // would keep an old one; it may only load scripts from this origin.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
