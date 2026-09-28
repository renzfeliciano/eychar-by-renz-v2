import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Next.js embeds its hydration/RSC payload as inline <script> tags, which
// needs 'unsafe-inline' for script-src without per-request nonce wiring.
// Scoped to production only so it never fights dev-mode HMR.
// 'wasm-unsafe-eval' is the narrow grant WebAssembly compilation needs — the
// clock screen's on-device face-liveness model (MediaPipe, self-hosted
// under /mediapipe) runs as WASM. It does not re-enable JS eval().
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // camera/geolocation must be `(self)`, not `()` — the empty list disables
  // them for this app's own pages too, which silently broke the self-service
  // clock's photo and GPS capture (getUserMedia/getCurrentPosition just fail).
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  ...(isProd ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }] : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
