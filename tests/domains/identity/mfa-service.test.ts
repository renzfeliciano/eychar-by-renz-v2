import { describe, it, expect, beforeEach } from "vitest";
import argon2 from "argon2";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";
import { MfaService } from "@/domains/identity/mfa-service";
import { generateTotp, TOTP_STEP_SECONDS } from "@/server/auth/totp";
import { openSecret } from "@/server/auth/secret-box";
import { BusinessRuleError, ValidationError } from "@/shared/errors";

const PASSWORD = "harbor-lantern-73-mango";

async function makeUser() {
  return UserModel.create({ username: `mfa.${Date.now()}.${Math.random()}`, passwordHash: await argon2.hash(PASSWORD) });
}

async function enroll(userId: string, now: Date) {
  const { secret } = await MfaService.startEnrollment(userId);
  const { recoveryCodes } = await MfaService.confirmEnrollment(userId, generateTotp(secret, now), { now });
  return { secret, recoveryCodes };
}

describe("MfaService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("enrolls in two steps and keeps the secret encrypted", async () => {
    const user = await makeUser();
    const { secret, otpauthUri } = await MfaService.startEnrollment(user._id.toString());
    expect(otpauthUri).toContain(`secret=${secret}`);

    const pending = await UserModel.findById(user._id).lean();
    expect(pending!.mfa?.enabled).toBe(false);
    expect(pending!.mfa?.pendingSecret).not.toContain(secret);
    expect(openSecret(pending!.mfa!.pendingSecret!)).toBe(secret);

    await expect(MfaService.confirmEnrollment(user._id.toString(), "000000")).rejects.toBeInstanceOf(ValidationError);

    const now = new Date();
    const { recoveryCodes } = await MfaService.confirmEnrollment(user._id.toString(), generateTotp(secret, now), { now });
    expect(recoveryCodes).toHaveLength(10);

    const enabled = await UserModel.findById(user._id).lean();
    expect(enabled!.mfa?.enabled).toBe(true);
    expect(enabled!.mfa?.pendingSecret).toBeFalsy();
    expect(enabled!.mfa?.recoveryCodeHashes).toHaveLength(10);
    expect(JSON.stringify(enabled!.mfa)).not.toContain(recoveryCodes[0]);
  });

  it("accepts an authenticator code once, not twice", async () => {
    const user = await makeUser();
    const now = new Date(Date.UTC(2026, 8, 28, 9, 0, 0));
    const { secret } = await enroll(user._id.toString(), now);

    const later = new Date(now.getTime() + 2 * TOTP_STEP_SECONDS * 1000);
    const code = generateTotp(secret, later);
    expect(await MfaService.verifySignIn(user._id.toString(), code, { now: later })).toBe(true);
    expect(await MfaService.verifySignIn(user._id.toString(), code, { now: later })).toBe(false);
    expect(await MfaService.verifySignIn(user._id.toString(), "123456", { now: later })).toBe(false);
  });

  it("accepts each recovery code exactly once", async () => {
    const user = await makeUser();
    const { recoveryCodes } = await enroll(user._id.toString(), new Date());

    expect(await MfaService.verifySignIn(user._id.toString(), recoveryCodes[3].toLowerCase())).toBe(true);
    expect(await MfaService.verifySignIn(user._id.toString(), recoveryCodes[3])).toBe(false);
    const fresh = await UserModel.findById(user._id).lean();
    expect(fresh!.mfa?.recoveryCodeHashes).toHaveLength(9);
  });

  it("turns off only with the account's password; an administrator can reset it", async () => {
    const user = await makeUser();
    await enroll(user._id.toString(), new Date());

    await expect(MfaService.disable(user._id.toString(), "wrong-password")).rejects.toBeInstanceOf(ValidationError);
    await MfaService.disable(user._id.toString(), PASSWORD);
    expect((await UserModel.findById(user._id).lean())!.mfa?.enabled).toBe(false);

    await enroll(user._id.toString(), new Date(Date.now() + 5 * TOTP_STEP_SECONDS * 1000));
    await MfaService.adminReset(user._id.toString(), { userId: undefined });
    const reset = await UserModel.findById(user._id).lean();
    expect(reset!.mfa?.enabled).toBe(false);
    expect(reset!.mfa?.secret).toBeFalsy();
  });

  it("can't be turned off by staff while the organization requires it", async () => {
    const user = await makeUser();
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-mfa-${Date.now()}-${Math.random()}`, security: { requireTwoStepForStaff: true } });
    const role = await RoleModel.create({ organizationId: organization._id, name: `HR ${Math.random()}`, permissionKeys: ["employees.read"] });
    await RoleAssignmentModel.create({ organizationId: organization._id, roleId: role._id, userId: user._id });
    await enroll(user._id.toString(), new Date());

    await expect(MfaService.disable(user._id.toString(), PASSWORD)).rejects.toBeInstanceOf(BusinessRuleError);
    expect((await UserModel.findById(user._id).lean())!.mfa?.enabled).toBe(true);
  });
});
