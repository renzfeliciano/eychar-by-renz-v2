import argon2 from "argon2";
import { loginSchema } from "@/shared/validation/auth";
import { findUserByLogin } from "./user-lookup";
import { LoginGuard } from "./login-guard";
import { MfaService } from "./mfa-service";

export type SignInFailure = "invalid" | "locked" | "rate_limited" | "mfa_required" | "invalid_otp";
export type SignInResult =
  | { ok: true; userId: string; username?: string | null; email?: string | null; mustChangePassword: boolean }
  | { ok: false; reason: SignInFailure };

// Computed once per process: argon2.verify runs with the same cost whether
// the account exists or not, so response time can't reveal which usernames
// are real.
const dummyHashPromise = argon2.hash("not-a-real-password");

/**
 * The whole sign-in decision, in order:
 * 1. the network's attempt limit;
 * 2. an attempt is reserved against the account (atomically, before the slow
 *    password hash, so parallel guesses can't overrun the lock); a locked
 *    account, or one whose remaining attempts are all in flight, gets none;
 * 3. the password (an unknown or disabled account answers exactly like a
 *    wrong password, and locks the same way after repeated failures);
 * 4. the lock (reported after the password is checked, whatever the
 *    password, so a lock never confirms a guess);
 * 5. the authenticator or recovery code, when two-factor sign-in is on.
 * Wrong passwords and wrong codes both count toward the lock.
 */
export async function signInWithPassword(credentials: unknown, { ip, now = new Date() }: { ip: string; now?: Date }): Promise<SignInResult> {
  if (!(await LoginGuard.allowAttempt(`ip:${ip}`, now))) return { ok: false, reason: "rate_limited" };

  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const user = await findUserByLogin(parsed.data.login);
  const userId = user?._id.toString();
  const attempt = userId ? await LoginGuard.reserveAttempt(userId, now) : null;
  const passwordMatches = await argon2.verify(user?.passwordHash ?? (await dummyHashPromise), parsed.data.password);

  if (!user || !userId) {
    const { locked } = await LoginGuard.recordUnknownLoginFailure(parsed.data.login, now);
    return { ok: false, reason: locked ? "locked" : "invalid" };
  }
  if (attempt === null) return { ok: false, reason: "locked" };
  if (!passwordMatches) {
    const { locked } = await LoginGuard.recordFailure(userId, { ip, now, attempt });
    return { ok: false, reason: locked ? "locked" : "invalid" };
  }

  if (user.mfa?.enabled) {
    if (!parsed.data.otp) {
      // The right password, and the code not asked for yet: not a guess.
      await LoginGuard.releaseAttempt(userId);
      return { ok: false, reason: "mfa_required" };
    }
    if (!(await MfaService.verifySignIn(userId, parsed.data.otp, { now }))) {
      const { locked } = await LoginGuard.recordFailure(userId, { ip, now, attempt });
      return { ok: false, reason: locked ? "locked" : "invalid_otp" };
    }
  }

  await LoginGuard.recordSuccess(userId, { ip, now });
  return { ok: true, userId, username: user.username, email: user.email, mustChangePassword: Boolean(user.mustChangePassword) };
}
