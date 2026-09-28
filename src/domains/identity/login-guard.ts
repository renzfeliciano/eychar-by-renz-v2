import { connectMongoDB } from "@/server/db/connection";
import { LoginThrottleModel, UserModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { auditUserEvent as audit } from "./user-audit";

/** Consecutive wrong passwords before the account locks. */
export const MAX_FAILED_SIGN_INS = 5;
export const LOCK_MINUTES = 15;
/**
 * Attempts per network per window. Generous on purpose: a whole site's
 * staff can share one office IP at shift start. The per-account lock is
 * what stops guessing at one account.
 */
export const NETWORK_ATTEMPT_LIMIT = 30;
const NETWORK_WINDOW_MS = 15 * 60_000;

type SignInContext = { ip: string; now?: Date };

/**
 * Brute-force protection for sign-in: a per-account lock after repeated
 * wrong passwords, and a per-network attempt limit kept in the database.
 * Every sign-in, failure and lock is written to the audit trail.
 */
export const LoginGuard = {
  isLocked(user: { lockedUntil?: Date | null }, now: Date = new Date()): boolean {
    return Boolean(user.lockedUntil && new Date(user.lockedUntil).getTime() > now.getTime());
  },

  /** Counts one attempt against `key`; false once the window's limit is used up. */
  async allowAttempt(key: string, now: Date = new Date()): Promise<boolean> {
    await connectMongoDB();
    const current = await LoginThrottleModel.findOneAndUpdate(
      { key, windowStart: { $gt: new Date(now.getTime() - NETWORK_WINDOW_MS) } },
      { $inc: { count: 1 } },
      { new: true },
    ).lean();
    if (current) return current.count <= NETWORK_ATTEMPT_LIMIT;

    const fresh = { count: 1, windowStart: now, expiresAt: new Date(now.getTime() + NETWORK_WINDOW_MS) };
    try {
      await LoginThrottleModel.updateOne({ key }, { $set: fresh }, { upsert: true });
    } catch (error) {
      // Two first attempts raced to create the window; the other one won.
      if (!isDuplicateKeyError(error)) throw error;
      await LoginThrottleModel.updateOne({ key }, { $inc: { count: 1 } });
    }
    return true;
  },

  async recordFailure(userId: string, { ip, now = new Date() }: SignInContext): Promise<{ locked: boolean }> {
    await connectMongoDB();
    const user = await UserModel.findByIdAndUpdate(userId, { $inc: { failedSignInCount: 1 } }, { new: true }).lean();
    if (!user) return { locked: false };
    await audit(userId, "auth.sign-in-failed", { ip, consecutiveFailures: user.failedSignInCount });

    if ((user.failedSignInCount ?? 0) < MAX_FAILED_SIGN_INS) return { locked: false };
    const lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
    await UserModel.updateOne({ _id: user._id }, { $set: { lockedUntil, failedSignInCount: 0 } });
    await audit(userId, "auth.account-locked", { ip, lockedUntil: lockedUntil.toISOString(), afterFailures: MAX_FAILED_SIGN_INS });
    return { locked: true };
  },

  async recordSuccess(userId: string, { ip, now = new Date() }: SignInContext): Promise<void> {
    await connectMongoDB();
    await UserModel.updateOne({ _id: userId }, { $set: { failedSignInCount: 0, lastSignInAt: now, lastSignInIp: ip }, $unset: { lockedUntil: 1 } });
    await audit(userId, "auth.signed-in", { ip });
  },

  async unlock(userId: string, actor: { userId?: string }): Promise<void> {
    await connectMongoDB();
    await UserModel.updateOne({ _id: userId }, { $set: { failedSignInCount: 0 }, $unset: { lockedUntil: 1 } });
    await audit(userId, "auth.account-unlocked", {}, actor.userId);
  },
};

/**
 * The client address for rate limiting and the audit trail: the first
 * X-Forwarded-For entry (set by the hosting proxy), else X-Real-IP. Only
 * trustworthy behind a proxy that overwrites these headers, which the
 * deployment must provide (see ARCHITECTURE.md, Security).
 */
export function clientIp(headers: Record<string, string | string[] | undefined> | Headers | undefined): string {
  const read = (name: string): string | undefined => {
    if (!headers) return undefined;
    if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name) ?? undefined;
    const value = (headers as Record<string, string | string[] | undefined>)[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const forwarded = read("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || read("x-real-ip")?.trim() || "unknown";
}
