import { createHash, randomBytes } from "crypto";
import { base32Encode } from "./totp";

/**
 * One-time recovery codes for someone who has lost their authenticator:
 * ten codes of 50 random bits each, shown once, stored only as SHA-256
 * hashes (they're random, so a fast hash is enough; there's nothing to
 * brute-force from a dictionary).
 */

const COUNT = 10;

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

export function generateRecoveryCodes(): string[] {
  const codes = new Set<string>();
  while (codes.size < COUNT) {
    const raw = base32Encode(randomBytes(7)).slice(0, 10);
    codes.add(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return [...codes];
}
