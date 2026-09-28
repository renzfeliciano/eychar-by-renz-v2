import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Time-based one-time passwords (RFC 6238, HMAC-SHA1, 6 digits, 30-second
 * steps): the codes Google Authenticator, Microsoft Authenticator, 1Password
 * and the like produce. Implemented directly on Node's crypto; there is
 * nothing here a dependency would add.
 */

export const TOTP_STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new random 160-bit secret, base32-encoded (the length RFC 4226 recommends). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

const stepAt = (now: Date) => Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);

export function generateTotp(secret: string, now: Date = new Date()): string {
  return hotp(base32Decode(secret), stepAt(now));
}

/**
 * The time step `code` matches (current, or one step either side for clock
 * drift), or null. A step at or before `lastUsedStep` is refused, so a code
 * seen once can't be replayed.
 */
export function verifyTotp(secret: string, code: string, { now = new Date(), lastUsedStep }: { now?: Date; lastUsedStep?: number | null } = {}): number | null {
  const candidate = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(candidate)) return null;
  const key = base32Decode(secret);
  const current = stepAt(now);
  for (const step of [current, current - 1, current + 1]) {
    if (lastUsedStep != null && step <= lastUsedStep) continue;
    if (timingSafeEqual(Buffer.from(hotp(key, step)), Buffer.from(candidate))) return step;
  }
  return null;
}

/** The link an authenticator app reads from the enrollment QR code. */
export function otpauthUri(secret: string, accountName: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_STEP_SECONDS}`;
}
