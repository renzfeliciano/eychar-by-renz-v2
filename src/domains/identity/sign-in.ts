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
 * 2. the password (an unknown or disabled account answers exactly like a wrong password);
 * 3. the account lock (checked after the password, so a lock never confirms a guess);
 * 4. the authenticator or recovery code, when two-factor sign-in is on.
 * Wrong passwords and wrong codes both count toward the lock.
 */
export async function signInWithPassword(credentials: unknown, { ip, now = new Date() }: { ip: string; now?: Date }): Promise<SignInResult> {
  if (!(await LoginGuard.allowAttempt(`ip:${ip}`, now))) return { ok: false, reason: "rate_limited" };

  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const user = await findUserByLogin(parsed.data.login);
  const passwordMatches = await argon2.verify(user?.passwordHash ?? (await dummyHashPromise), parsed.data.password);
  if (!user) return { ok: false, reason: "invalid" };

  const userId = user._id.toString();
  if (LoginGuard.isLocked(user, now)) return { ok: false, reason: "locked" };
  if (!passwordMatches) {
    const { locked } = await LoginGuard.recordFailure(userId, { ip, now });
    return { ok: false, reason: locked ? "locked" : "invalid" };
  }

  if (user.mfa?.enabled) {
    if (!parsed.data.otp) return { ok: false, reason: "mfa_required" };
    if (!(await MfaService.verifySignIn(userId, parsed.data.otp, { now }))) {
      const { locked } = await LoginGuard.recordFailure(userId, { ip, now });
      return { ok: false, reason: locked ? "locked" : "invalid_otp" };
    }
  }

  await LoginGuard.recordSuccess(userId, { ip, now });
  return { ok: true, userId, username: user.username, email: user.email, mustChangePassword: Boolean(user.mustChangePassword) };
}
