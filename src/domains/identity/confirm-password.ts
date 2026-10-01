import argon2 from "argon2";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { ValidationError } from "@/shared/errors";

/**
 * Checks the password someone re-enters to confirm a sensitive change on
 * their own account. Every attempt counts toward a per-user limit first,
 * so a hijacked session can't be used to guess the password.
 */
export async function confirmAccountPassword(userId: string, passwordHash: string, password: string, message = "Your password is incorrect."): Promise<void> {
  await enforceRateLimit("passwordCheck", userId);
  if (!(await argon2.verify(passwordHash, password))) throw new ValidationError(message);
}
