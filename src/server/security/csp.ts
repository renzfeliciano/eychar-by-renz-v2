/**
 * The page Content-Security-Policy, built per request with a fresh nonce
 * (src/proxy.ts). Only scripts carrying the nonce run: Next.js adds it to its
 * own scripts automatically, and 'strict-dynamic' lets those load the app's
 * chunks. An injected <script> (or onclick=…) has no nonce, so it doesn't run
 * — the main defence 'unsafe-inline' used to switch off.
 *
 * - 'wasm-unsafe-eval': WebAssembly for the clock screen's on-device
 *   face-liveness check (MediaPipe, self-hosted under /mediapipe). It does
 *   not re-enable JS eval().
 * - style-src keeps 'unsafe-inline': React style={…} attributes need it, and
 *   inline styles can't run code.
 * - blob:/data: images: camera snapshots and generated previews.
 */
export function buildContentSecurityPolicy(nonce: string, { isDev = false }: { isDev?: boolean } = {}): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** 128 random bits, base64: a new one for every page request. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
