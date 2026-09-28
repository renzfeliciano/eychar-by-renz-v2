/**
 * Cross-site request forgery protection for the JSON API: a request that
 * changes data must come from the app's own origin. The session cookie is
 * SameSite=Lax already; this is the second, server-side layer.
 *
 * Exempt: NextAuth's routes (which carry their own CSRF token) and the cron
 * endpoint (server-to-server, authenticated by CRON_SECRET, never by cookie).
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT_PREFIXES = ["/api/auth/", "/api/cron/"];

export type OriginCheckInput = {
  method: string;
  pathname: string;
  host: string | null;
  /** X-Forwarded-Host, when a trusted proxy sits in front of the app. */
  forwardedHost?: string | null;
  origin?: string | null;
  referer?: string | null;
  secFetchSite?: string | null;
  /** Extra origins that count as the app itself, e.g. NEXTAUTH_URL's. */
  allowedOrigins: string[];
};

export type OriginCheckResult = { ok: true } | { ok: false; reason: string };

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export function checkRequestOrigin(input: OriginCheckInput): OriginCheckResult {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return { ok: true };
  if (EXEMPT_PREFIXES.some((prefix) => input.pathname.startsWith(prefix))) return { ok: true };
  if (input.secFetchSite === "cross-site") return { ok: false, reason: "cross-site request" };

  const sourceHost = hostOf(input.origin) ?? hostOf(input.referer);
  if (!sourceHost) return { ok: false, reason: "missing Origin" };

  const allowed = new Set(
    [input.forwardedHost?.split(",")[0]?.trim(), input.host, ...input.allowedOrigins.map((origin) => hostOf(origin))]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase()),
  );
  return allowed.has(sourceHost) ? { ok: true } : { ok: false, reason: `origin ${sourceHost} not allowed` };
}
