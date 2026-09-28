import { describe, it, expect } from "vitest";
import { resolveSessionState, replacedSessionActivity } from "@/server/auth/session-policy";

const ONE_MINUTE = 60_000;
const baseNow = 1_000_000_000;

describe("resolveSessionState", () => {
  it("is not expired when the session matches and is within the inactivity window", () => {
    const result = resolveSessionState({
      tokenSessionId: "session-1",
      tokenLastActivityAt: baseNow - ONE_MINUTE,
      now: baseNow,
      inactivityMs: 30 * ONE_MINUTE,
      currentUser: { activeSessionId: "session-1" },
    });

    expect(result).toEqual({ expired: false });
  });

  it("is not expired exactly at the inactivity boundary", () => {
    const result = resolveSessionState({
      tokenSessionId: "session-1",
      tokenLastActivityAt: baseNow - 30 * ONE_MINUTE,
      now: baseNow,
      inactivityMs: 30 * ONE_MINUTE,
      currentUser: { activeSessionId: "session-1" },
    });

    expect(result).toEqual({ expired: false });
  });

  it("expires as idle_timeout once inactivity exceeds the window, even with a matching session", () => {
    const result = resolveSessionState({
      tokenSessionId: "session-1",
      tokenLastActivityAt: baseNow - 31 * ONE_MINUTE,
      now: baseNow,
      inactivityMs: 30 * ONE_MINUTE,
      currentUser: { activeSessionId: "session-1" },
    });

    expect(result).toEqual({ expired: true, reason: "idle_timeout" });
  });

  it("expires as concurrent_session when a later login elsewhere overwrote activeSessionId", () => {
    const result = resolveSessionState({
      tokenSessionId: "session-1",
      tokenLastActivityAt: baseNow - ONE_MINUTE,
      now: baseNow,
      inactivityMs: 30 * ONE_MINUTE,
      currentUser: { activeSessionId: "session-2" },
    });

    expect(result).toEqual({ expired: true, reason: "concurrent_session" });
  });

  it("expires as idle_timeout (not concurrent_session) when the user no longer exists or is disabled", () => {
    const result = resolveSessionState({
      tokenSessionId: "session-1",
      tokenLastActivityAt: baseNow - ONE_MINUTE,
      now: baseNow,
      inactivityMs: 30 * ONE_MINUTE,
      currentUser: null,
    });

    expect(result).toEqual({ expired: true, reason: "idle_timeout" });
  });

  it("checks idle timeout before the session-id match, so a stale+superseded token reports idle_timeout", () => {
    const result = resolveSessionState({
      tokenSessionId: "session-1",
      tokenLastActivityAt: baseNow - 31 * ONE_MINUTE,
      now: baseNow,
      inactivityMs: 30 * ONE_MINUTE,
      currentUser: { activeSessionId: "session-2" },
    });

    expect(result).toEqual({ expired: true, reason: "idle_timeout" });
  });
});

describe("replacedSessionActivity", () => {
  const now = Date.parse("2026-09-29T10:00:00.000Z");
  const inactivityMs = 30 * 60_000;

  it("reports when the account's previous session was still live, so the new sign-in can say it was ended", () => {
    const lastActivityAt = new Date(now - 5 * 60_000);
    expect(replacedSessionActivity({ previousSessionId: "old", lastActivityAt, now, inactivityMs })).toEqual(lastActivityAt);
  });

  it("stays quiet on a first sign-in or when the old session had already gone idle", () => {
    expect(replacedSessionActivity({ previousSessionId: null, lastActivityAt: new Date(now - 60_000), now, inactivityMs })).toBeNull();
    expect(replacedSessionActivity({ previousSessionId: "old", lastActivityAt: new Date(now - 31 * 60_000), now, inactivityMs })).toBeNull();
    expect(replacedSessionActivity({ previousSessionId: "old", lastActivityAt: null, now, inactivityMs })).toBeNull();
  });
});
