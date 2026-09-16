export type SessionPolicyInput = {
  tokenSessionId: string;
  tokenLastActivityAt: number;
  now: number;
  inactivityMs: number;
  /** null means the account no longer exists or has been disabled. */
  currentUser: { activeSessionId?: string | null } | null;
};

export type SessionPolicyResult =
  | { expired: false }
  | { expired: true; reason: "idle_timeout" | "concurrent_session" };

/**
 * Pure decision function for single-active-session + idle-timeout
 * enforcement — deliberately kept out of the NextAuth `jwt` callback so it
 * can be unit tested directly, without mocking the framework or hitting a
 * database. Idle timeout is checked first (cheap, no DB read needed): a
 * token that is both stale *and* superseded reports idle_timeout, not
 * concurrent_session, since that's the more useful message to the user in
 * that case ("your session expired" vs. a false "signed in elsewhere").
 */
export function resolveSessionState(input: SessionPolicyInput): SessionPolicyResult {
  if (input.now - input.tokenLastActivityAt > input.inactivityMs) {
    return { expired: true, reason: "idle_timeout" };
  }

  if (!input.currentUser) {
    return { expired: true, reason: "idle_timeout" };
  }

  if (input.currentUser.activeSessionId !== input.tokenSessionId) {
    return { expired: true, reason: "concurrent_session" };
  }

  return { expired: false };
}
