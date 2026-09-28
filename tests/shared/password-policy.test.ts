import { describe, it, expect } from "vitest";
import { checkPassword, PASSWORD_MIN_LENGTH } from "@/shared/validation/password-policy";
import { createStaffAccountSchema, createEmployeeAccountSchema, changePasswordSchema } from "@/shared/validation/auth";

describe("checkPassword", () => {
  it("accepts a long passphrase", () => {
    expect(checkPassword("harbor-lantern-73-mango")).toEqual([]);
  });

  it("requires the minimum length", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(checkPassword("Sh0rt-pass")).toContain(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  });

  it("caps the length so hashing can't be abused", () => {
    expect(checkPassword("a".repeat(129))).toContain("Use at most 128 characters.");
  });

  it("rejects common and easily guessed passwords, whatever the case", () => {
    expect(checkPassword("Password1234")).toContain("This password is too common. Choose something less predictable.");
    expect(checkPassword("qwertyuiop123")).toContain("This password is too common. Choose something less predictable.");
    expect(checkPassword("aaaaaaaaaaaa")).toContain("Avoid repeating the same character.");
  });

  it("rejects a password that contains the username or the email's name", () => {
    expect(checkPassword("jdelacruz-2026!", { username: "jdelacruz" })).toContain("Don't include your username or email in the password.");
    expect(checkPassword("maria.santos#2026", { email: "maria.santos@pcas.ph" })).toContain("Don't include your username or email in the password.");
  });
});

describe("account schemas use the policy", () => {
  it("rejects a staff account whose password breaks the rules", () => {
    const result = createStaffAccountSchema.safeParse({ organizationId: "o", firstName: "Ana", lastName: "Reyes", username: "areyes", password: "areyes123456" });
    expect(result.success).toBe(false);
  });

  it("rejects a weak employee account password", () => {
    const result = createEmployeeAccountSchema.safeParse({ organizationId: "o", employeeId: "e", username: "jmercado", password: "12345678" });
    expect(result.success).toBe(false);
  });

  it("requires a new password that differs from the current one", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "harbor-lantern-73-mango", newPassword: "harbor-lantern-73-mango" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "old-password", newPassword: "harbor-lantern-73-mango" }).success).toBe(true);
  });
});
