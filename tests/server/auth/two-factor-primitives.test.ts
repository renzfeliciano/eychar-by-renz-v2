import { describe, it, expect } from "vitest";
import { base32Encode, base32Decode, generateTotp, verifyTotp, generateTotpSecret, otpauthUri, TOTP_STEP_SECONDS } from "@/server/auth/totp";
import { sealSecret, openSecret } from "@/server/auth/secret-box";
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } from "@/server/auth/recovery-codes";

// RFC 6238 appendix B, SHA-1 key "12345678901234567890"; the RFC's 8-digit values, last 6 digits.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("base32", () => {
  it("round-trips bytes (RFC 4648 alphabet, no padding)", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("MZXW6YTBOI").toString()).toBe("foobar");
    expect(base32Decode("mzxw 6ytb oi").toString()).toBe("foobar");
  });
});

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(generateTotp(RFC_SECRET, new Date(59_000))).toBe("287082");
    expect(generateTotp(RFC_SECRET, new Date(1_111_111_109_000))).toBe("081804");
    expect(generateTotp(RFC_SECRET, new Date(1_234_567_890_000))).toBe("005924");
  });

  it("accepts the current code and one step either side, and reports the step used", () => {
    const now = new Date(1_234_567_890_000);
    const step = Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);
    expect(verifyTotp(RFC_SECRET, "005924", { now })).toBe(step);
    const previous = generateTotp(RFC_SECRET, new Date(now.getTime() - TOTP_STEP_SECONDS * 1000));
    expect(verifyTotp(RFC_SECRET, previous, { now })).toBe(step - 1);
    const tooOld = generateTotp(RFC_SECRET, new Date(now.getTime() - 3 * TOTP_STEP_SECONDS * 1000));
    expect(verifyTotp(RFC_SECRET, tooOld, { now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abc123", { now })).toBeNull();
  });

  it("refuses a code from a step already used (no replay)", () => {
    const now = new Date(1_234_567_890_000);
    const step = Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);
    expect(verifyTotp(RFC_SECRET, "005924", { now, lastUsedStep: step })).toBeNull();
  });

  it("makes 160-bit secrets and an otpauth link authenticator apps understand", () => {
    const secret = generateTotpSecret();
    expect(base32Decode(secret)).toHaveLength(20);
    const uri = otpauthUri(secret, "renzy_admin", "EychAr");
    expect(uri).toBe(`otpauth://totp/EychAr:renzy_admin?secret=${secret}&issuer=EychAr&algorithm=SHA1&digits=6&period=30`);
  });
});

describe("secret box", () => {
  it("encrypts so the stored value never shows the secret, and decrypts it back", () => {
    const sealed = sealSecret("JBSWY3DPEHPK3PXP");
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(openSecret(sealed)).toBe("JBSWY3DPEHPK3PXP");
    expect(sealSecret("JBSWY3DPEHPK3PXP")).not.toBe(sealed); // fresh IV each time
  });

  it("rejects a tampered value", () => {
    const sealed = sealSecret("JBSWY3DPEHPK3PXP");
    const parts = sealed.split(":");
    parts[3] = Buffer.from("tampered!").toString("base64");
    expect(() => openSecret(parts.join(":"))).toThrow();
  });
});

describe("recovery codes", () => {
  it("makes ten distinct, readable codes and hashes them insensitive to case and dashes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    expect(hashRecoveryCode(codes[0])).toBe(hashRecoveryCode(codes[0].toLowerCase().replace("-", " ")));
    expect(normalizeRecoveryCode(" abcde-fghij ")).toBe("ABCDEFGHIJ");
  });
});
