import argon2 from "argon2";
import { connectMongoDB } from "@/server/db/connection";
import { UserModel } from "@/server/db/models";
import { generateTotpSecret, otpauthUri, verifyTotp } from "@/server/auth/totp";
import { openSecret, sealSecret } from "@/server/auth/secret-box";
import { generateRecoveryCodes, hashRecoveryCode } from "@/server/auth/recovery-codes";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/shared/errors";
import { auditUserEvent } from "./user-audit";
import { BRAND } from "@/lib/brand";

// The label authenticator apps show beside the code. Accounts enrolled
// before the rebrand keep their old label until they re-enrol; the codes
// themselves don't depend on it.
const ISSUER = BRAND.shortName;

const ALREADY_ON = "Two-step verification is already on. To move it to a new phone, turn it off first (that asks for your password), then set it up again.";

async function loadUser(userId: string) {
  await connectMongoDB();
  const user = await UserModel.findById(userId).lean();
  if (!user) throw new NotFoundError("Account not found");
  return user;
}

/**
 * Two-factor sign-in with an authenticator app. Enrollment is two steps
 * (scan, then prove it works with a code) so nobody locks themselves out
 * with a half-scanned secret. Turning it on returns ten recovery codes,
 * shown once.
 */
export const MfaService = {
  async startEnrollment(userId: string): Promise<{ secret: string; otpauthUri: string }> {
    const user = await loadUser(userId);
    // Replacing a working authenticator would let a borrowed session swap in
    // its own phone; turning it off first needs the password.
    if (user.mfa?.enabled) throw new BusinessRuleError(ALREADY_ON);
    const secret = generateTotpSecret();
    await UserModel.updateOne({ _id: user._id }, { $set: { "mfa.pendingSecret": sealSecret(secret) } });
    return { secret, otpauthUri: otpauthUri(secret, user.username ?? user.email ?? "account", ISSUER) };
  },

  async confirmEnrollment(userId: string, code: string, { now = new Date() }: { now?: Date } = {}): Promise<{ recoveryCodes: string[] }> {
    const user = await loadUser(userId);
    if (user.mfa?.enabled) throw new BusinessRuleError(ALREADY_ON);
    if (!user.mfa?.pendingSecret) throw new ValidationError("Start two-factor setup again: there's no setup in progress.");
    const secret = openSecret(user.mfa.pendingSecret);
    const step = verifyTotp(secret, code, { now });
    if (step === null) throw new ValidationError("That code didn't match. Check the time on your phone and enter the newest code.");

    const recoveryCodes = generateRecoveryCodes();
    // Conditional on it still being off with this setup pending, so a parallel request can't slip a second enrollment in.
    const enabled = await UserModel.updateOne(
      { _id: user._id, "mfa.enabled": { $ne: true }, "mfa.pendingSecret": user.mfa.pendingSecret },
      {
        $set: {
          "mfa.enabled": true,
          "mfa.secret": sealSecret(secret),
          "mfa.recoveryCodeHashes": recoveryCodes.map(hashRecoveryCode),
          "mfa.enabledAt": now,
          "mfa.lastUsedStep": step,
        },
        $unset: { "mfa.pendingSecret": 1 },
      },
    );
    if (enabled.modifiedCount !== 1) throw new BusinessRuleError(ALREADY_ON);
    await auditUserEvent(userId, "auth.mfa-enabled");
    return { recoveryCodes };
  },

  /**
   * The second sign-in step: a current authenticator code (each accepted
   * once) or an unused recovery code (spent on use).
   */
  async verifySignIn(userId: string, code: string, { now = new Date() }: { now?: Date } = {}): Promise<boolean> {
    const user = await loadUser(userId);
    if (!user.mfa?.enabled || !user.mfa.secret) return false;

    const step = verifyTotp(openSecret(user.mfa.secret), code, { now, lastUsedStep: user.mfa.lastUsedStep });
    if (step !== null) {
      // Conditional on the step, so two concurrent sign-ins can't both spend the same code.
      const result = await UserModel.updateOne(
        { _id: user._id, $or: [{ "mfa.lastUsedStep": { $exists: false } }, { "mfa.lastUsedStep": { $lt: step } }] },
        { $set: { "mfa.lastUsedStep": step } },
      );
      return result.modifiedCount === 1;
    }

    const hash = hashRecoveryCode(code);
    if (!hash || !(user.mfa.recoveryCodeHashes ?? []).includes(hash)) return false;
    const spent = await UserModel.updateOne({ _id: user._id, "mfa.recoveryCodeHashes": hash }, { $pull: { "mfa.recoveryCodeHashes": hash } });
    if (spent.modifiedCount !== 1) return false;
    await auditUserEvent(userId, "auth.recovery-code-used", { remaining: (user.mfa.recoveryCodeHashes?.length ?? 1) - 1 });
    return true;
  },

  /** New recovery codes (the old ones stop working); needs the account's password. */
  async regenerateRecoveryCodes(userId: string, password: string): Promise<{ recoveryCodes: string[] }> {
    const user = await loadUser(userId);
    if (!(await argon2.verify(user.passwordHash, password))) throw new ValidationError("Your password is incorrect.");
    if (!user.mfa?.enabled) throw new ValidationError("Two-factor sign-in isn't on for this account.");
    const recoveryCodes = generateRecoveryCodes();
    await UserModel.updateOne({ _id: user._id }, { $set: { "mfa.recoveryCodeHashes": recoveryCodes.map(hashRecoveryCode) } });
    await auditUserEvent(userId, "auth.mfa-recovery-codes-regenerated");
    return { recoveryCodes };
  },

  /** The account holder turning it off; needs their password. */
  async disable(userId: string, password: string): Promise<void> {
    const user = await loadUser(userId);
    if (!(await argon2.verify(user.passwordHash, password))) throw new ValidationError("Your password is incorrect.");
    await UserModel.updateOne({ _id: user._id }, { $set: { mfa: { enabled: false } } });
    await auditUserEvent(userId, "auth.mfa-disabled");
  },

  /** An administrator clearing it for someone who lost their phone and codes; they can enroll again. */
  async adminReset(userId: string, actor: { userId?: string }): Promise<void> {
    const user = await loadUser(userId);
    await UserModel.updateOne({ _id: user._id }, { $set: { mfa: { enabled: false } } });
    await auditUserEvent(userId, "auth.mfa-reset", {}, actor.userId);
  },
};
