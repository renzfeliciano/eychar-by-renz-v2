/**
 * Idle sign-out (ADR-030 addendum): after this long without a keypress,
 * click, scroll or touch the session ends, with a warning shown for the
 * last few seconds. The organization's Security settings override these;
 * these are the defaults it starts with.
 */
export const SESSION_IDLE_MS = 60_000;
export const SESSION_IDLE_WARNING_MS = 15_000;

/** Grace the server adds on top of the idle limit, so a person active right up to it isn't cut off between activity pings. */
export const SERVER_IDLE_GRACE_MS = 30_000;

/** How often the browser tells the server the person is still active. */
export const ACTIVITY_PING_MS = 15_000;

export type IdlePhase = "active" | "warning" | "expired";

export function idleState(lastActivityAt: number, now: number, idleMs: number = SESSION_IDLE_MS, warningMs: number = SESSION_IDLE_WARNING_MS): { phase: IdlePhase; remainingMs: number } {
  const remainingMs = Math.max(0, idleMs - (now - lastActivityAt));
  if (remainingMs === 0) return { phase: "expired", remainingMs: 0 };
  if (remainingMs <= warningMs) return { phase: "warning", remainingMs };
  return { phase: "active", remainingMs };
}
