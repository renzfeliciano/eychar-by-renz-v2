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

/** A login string that matches no active account locks the same way a real account does. */
const UNKNOWN_LOGIN_WINDOW_MS = LOCK_MINUTES * 60_000;

/**
 * One more attempt against `key` in a fixed window, done atomically so
 * concurrent attempts can't share a count: bump the live window, else
 * restart an expired one, else create it. Returns the attempt's number in
 * the window. `restartAt` restarts the window from this attempt once the
 * count reaches it (an unknown login's "lock" then lasts a full period from
 * the attempt that triggered it, like a real account's).
 */
async function countAttempt(key: string, now: Date, windowMs: number, restartAt?: number): Promise<number> {
  await connectMongoDB();
  const cutoff = new Date(now.getTime() - windowMs);
  const fresh = { count: 1, windowStart: now, expiresAt: new Date(now.getTime() + windowMs) };
  for (let tries = 0; tries < 3; tries += 1) {
    const current = await LoginThrottleModel.findOneAndUpdate({ key, windowStart: { $gt: cutoff } }, { $inc: { count: 1 } }, { new: true }).lean();
    if (current) {
      if (restartAt !== undefined && current.count === restartAt) {
        await LoginThrottleModel.updateOne({ _id: current._id }, { $set: { windowStart: now, expiresAt: new Date(now.getTime() + windowMs) } });
      }
      return current.count as number;
    }
    const restarted = await LoginThrottleModel.findOneAndUpdate({ key, windowStart: { $lte: cutoff } }, { $set: fresh }, { new: true }).lean();
    if (restarted) return 1;
    try {
      await LoginThrottleModel.create({ key, ...fresh });
      return 1;
    } catch (error) {
      // Another attempt created the window first; count against it.
      if (!isDuplicateKeyError(error)) throw error;
    }
  }
  // Couldn't settle on a window: fail closed.
  return Number.MAX_SAFE_INTEGER;
}

/** Not locked now, and fewer than the limit of attempts counted or in flight. */
function reservableAccount(now: Date) {
  return {
    $and: [
      { $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lte: now } }] },
      { $or: [{ failedSignInCount: { $exists: false } }, { failedSignInCount: null }, { failedSignInCount: { $lt: MAX_FAILED_SIGN_INS } }] },
    ],
  };
}

/**
 * Brute-force protection for sign-in: a per-account lock after repeated
 * wrong passwords, and a per-network attempt limit kept in the database.
 * Every sign-in, failure and lock is written to the audit trail.
 *
 * The account's attempt is reserved (counted) atomically *before* the slow
 * password hash is checked, so any number of parallel guesses can't get more
 * than MAX_FAILED_SIGN_INS past the lock: the count is the gate, not a read
 * taken before the hash.
 */
export const LoginGuard = {
  isLocked(user: { lockedUntil?: Date | null }, now: Date = new Date()): boolean {
    return Boolean(user.lockedUntil && new Date(user.lockedUntil).getTime() > now.getTime());
  },

  /** Counts one attempt against `key`; false once the window's limit is used up. */
  async allowAttempt(key: string, now: Date = new Date()): Promise<boolean> {
    return (await countAttempt(key, now, NETWORK_WINDOW_MS)) <= NETWORK_ATTEMPT_LIMIT;
  },

  /**
   * Counts an attempt at an account before its password (or code) is
   * checked. Returns the attempt's number (1..MAX_FAILED_SIGN_INS), or null
   * when the account is locked or its remaining attempts are all in flight.
   * A success clears the count (recordSuccess); a step that isn't a guess
   * hands it back (releaseAttempt); a failure keeps it (recordFailure).
   */
  async reserveAttempt(userId: string, now: Date = new Date()): Promise<number | null> {
    await connectMongoDB();
    const user = await UserModel.findOneAndUpdate({ _id: userId, ...reservableAccount(now) }, { $inc: { failedSignInCount: 1 } }, { new: true }).lean();
    return user ? ((user.failedSignInCount as number | undefined) ?? 1) : null;
  },

  /** Gives back a reserved attempt that turned out not to be a guess (the password was right, the code not yet asked). */
  async releaseAttempt(userId: string): Promise<void> {
    await connectMongoDB();
    await UserModel.updateOne({ _id: userId, failedSignInCount: { $gt: 0 } }, { $inc: { failedSignInCount: -1 } });
  },

  /**
   * A login string that matches no active account: counted per normalized
   * login, so it reports "locked" after the same number of failures a real
   * account would, and the answer never reveals which usernames exist.
   */
  async recordUnknownLoginFailure(login: string, now: Date = new Date()): Promise<{ locked: boolean }> {
    const count = await countAttempt(`login:${login.trim().toLowerCase()}`, now, UNKNOWN_LOGIN_WINDOW_MS, MAX_FAILED_SIGN_INS);
    return { locked: count >= MAX_FAILED_SIGN_INS };
  },

  /**
   * A wrong password or code. Pass the number reserveAttempt returned (the
   * failure is already counted); without it, the failure is counted here.
   */
  async recordFailure(userId: string, { ip, now = new Date(), attempt }: SignInContext & { attempt?: number }): Promise<{ locked: boolean }> {
    await connectMongoDB();
    let failures = attempt;
    if (failures === undefined) {
      const user = await UserModel.findByIdAndUpdate(userId, { $inc: { failedSignInCount: 1 } }, { new: true }).lean();
      if (!user) return { locked: false };
      failures = (user.failedSignInCount as number | undefined) ?? 1;
    }
    await audit(userId, "auth.sign-in-failed", { ip, consecutiveFailures: failures });

    if (failures < MAX_FAILED_SIGN_INS) return { locked: false };
    const lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
    await UserModel.updateOne({ _id: userId }, { $set: { lockedUntil, failedSignInCount: 0 } });
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

/** Extra proxies in front of the platform's own edge that append to X-Forwarded-For (TRUSTED_PROXY_HOPS, default 0). */
function trustedProxyHops(): number {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS);
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
}

/**
 * The client address for rate limiting and the audit trail. Anyone can send
 * their own X-Forwarded-For, and proxies append to it, so its first entry is
 * whatever the client claimed. In order of trust:
 * 1. x-vercel-forwarded-for, which Vercel's edge sets itself (read only when
 *    running on Vercel: anywhere else a client could send it);
 * 2. the right-most X-Forwarded-For entry, after skipping the entries added
 *    by TRUSTED_PROXY_HOPS further proxies of our own (that is the address
 *    the outermost trusted proxy saw);
 * 3. X-Real-IP.
 */
export function clientIp(headers: Record<string, string | string[] | undefined> | Headers | undefined): string {
  const read = (name: string): string | undefined => {
    if (!headers) return undefined;
    if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name) ?? undefined;
    const value = (headers as Record<string, string | string[] | undefined>)[name];
    return Array.isArray(value) ? value.join(",") : value;
  };
  const vercel = process.env.VERCEL ? read("x-vercel-forwarded-for")?.split(",")[0]?.trim() : undefined;
  if (vercel) return vercel;

  const forwarded = (read("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (forwarded.length > 0) return forwarded[Math.max(0, forwarded.length - 1 - trustedProxyHops())];

  return read("x-real-ip")?.trim() || "unknown";
}
