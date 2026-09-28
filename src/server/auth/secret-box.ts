import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

/**
 * Encryption at rest for small secrets (authenticator-app keys): AES-256-GCM,
 * stored as "v1:<iv>:<tag>:<ciphertext>" in base64. The key comes from
 * MFA_ENCRYPTION_KEY (32 bytes, base64) when set, else is derived from
 * NEXTAUTH_SECRET with HKDF. Rotating the key makes existing enrollments
 * unreadable, so those users would need to enroll again.
 */

function encryptionKey(): Buffer {
  const explicit = process.env.MFA_ENCRYPTION_KEY;
  if (explicit) {
    const key = Buffer.from(explicit, "base64");
    if (key.length !== 32) throw new Error("MFA_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    return key;
  }
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Set MFA_ENCRYPTION_KEY or NEXTAUTH_SECRET to store two-factor secrets");
  return Buffer.from(hkdfSync("sha256", secret, "workforcehub", "mfa-secret-box-v1", 32));
}

export function sealSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

/** Throws if the value was altered or sealed with another key. */
export function openSecret(sealed: string): string {
  const [version, iv, tag, ciphertext] = sealed.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Unrecognized sealed secret");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}
