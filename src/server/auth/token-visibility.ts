import type { JWT } from "next-auth/jwt";
import { SERVER_IDLE_GRACE_MS } from "@/lib/session-idle";
import { getInactivityMs, getSessionMaxAgeMs } from "./inactivity";

/**
 * Whether a decoded session token still grants a view of hidden test data
 * (ADR-034). The cookie can outlive the session it carries (the jwt callback
 * only rewrites it when the browser asks for the session), so a token that
 * was marked expired, has gone idle past its limit, or is past the absolute
 * lifetime grants nothing, whatever its seesHidden flag says.
 */
export function tokenSeesHidden(token: JWT | null | undefined, now: number = Date.now()): boolean {
  if (!token || token.expired || !token.seesHidden || !token.userId || !token.sessionId) return false;
  const idleMs = (token.idleMs ?? getInactivityMs()) + SERVER_IDLE_GRACE_MS;
  if (typeof token.lastActivityAt !== "number" || now - token.lastActivityAt > idleMs) return false;
  if (typeof token.signedInAt === "number" && now - token.signedInAt > getSessionMaxAgeMs()) return false;
  return true;
}
