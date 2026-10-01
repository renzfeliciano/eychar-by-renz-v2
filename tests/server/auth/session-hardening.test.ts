import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveSessionState } from "@/server/auth/session-policy";
import { getSessionMaxAgeMs } from "@/server/auth/inactivity";
import { tokenSeesHidden } from "@/server/auth/token-visibility";
import { openSecret, sealSecret } from "@/server/auth/secret-box";

const HOUR = 60 * 60_000;

describe("absolute session lifetime", () => {
  afterEach(() => {
    delete process.env.SESSION_MAX_HOURS;
  });

  it("defaults to 12 hours and reads SESSION_MAX_HOURS", () => {
    expect(getSessionMaxAgeMs()).toBe(12 * HOUR);
    process.env.SESSION_MAX_HOURS = "4";
    expect(getSessionMaxAgeMs()).toBe(4 * HOUR);
    process.env.SESSION_MAX_HOURS = "nonsense";
    expect(getSessionMaxAgeMs()).toBe(12 * HOUR);
  });

  it("ends an active session once it's older than the cap, like going idle", () => {
    const now = 100 * HOUR;
    const base = { tokenSessionId: "s", tokenLastActivityAt: now - 1000, now, inactivityMs: 30 * 60_000, currentUser: { activeSessionId: "s" }, maxAgeMs: 12 * HOUR };
    expect(resolveSessionState({ ...base, tokenSignedInAt: now - 11 * HOUR })).toEqual({ expired: false });
    expect(resolveSessionState({ ...base, tokenSignedInAt: now - 13 * HOUR })).toEqual({ expired: true, reason: "idle_timeout" });
  });
});

describe("tokenSeesHidden", () => {
  const now = 50 * HOUR;
  const live = { userId: "u", sessionId: "s", seesHidden: true, lastActivityAt: now - 60_000, idleMs: 30 * 60_000, signedInAt: now - HOUR, expired: false };

  it("is granted only by a live token", () => {
    expect(tokenSeesHidden(live, now)).toBe(true);
    expect(tokenSeesHidden({ ...live, seesHidden: false }, now)).toBe(false);
    expect(tokenSeesHidden({ ...live, expired: true }, now)).toBe(false);
    expect(tokenSeesHidden({ ...live, lastActivityAt: now - 2 * HOUR }, now)).toBe(false);
    expect(tokenSeesHidden({ ...live, signedInAt: now - 13 * HOUR }, now)).toBe(false);
    expect(tokenSeesHidden(null, now)).toBe(false);
  });
});

describe("secret box", () => {
  it("rejects a sealed secret whose authentication tag was shortened", () => {
    const sealed = sealSecret("JBSWY3DPEHPK3PXP");
    expect(openSecret(sealed)).toBe("JBSWY3DPEHPK3PXP");
    const [version, iv, tag, ciphertext] = sealed.split(":");
    const short = [version, iv, Buffer.from(tag, "base64").subarray(0, 4).toString("base64"), ciphertext].join(":");
    expect(() => openSecret(short)).toThrow();
  });

  it("warns once in production when MFA_ENCRYPTION_KEY isn't set, without failing", async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MFA_ENCRYPTION_KEY", "");
    try {
      const box = await import("@/server/auth/secret-box");
      expect(box.openSecret(box.sealSecret("a"))).toBe("a");
      box.sealSecret("b");
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
      warn.mockRestore();
    }
  });
});
