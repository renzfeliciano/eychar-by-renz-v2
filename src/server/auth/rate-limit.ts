// Best-effort, single-process in-memory rate limiter for login attempts.
// Per AGENTS.md §45, Redis/Upstash is not introduced until there's a
// concrete need — this is a documented gap for a multi-instance/serverless
// deployment (see ARCHITECTURE.md) where each instance tracks separately,
// not a claim of complete brute-force protection.
const attempts = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 5;

export function checkLoginRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    return true;
  }

  entry.count += 1;
  return entry.count <= MAX_ATTEMPTS_PER_WINDOW;
}
