import { describe, it, expect, beforeEach } from "vitest";
import argon2 from "argon2";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, OrganizationModel, PermissionModel, PersonModel, RoleAssignmentModel, UserModel } from "@/server/db/models";
import { RoleService } from "@/domains/authorization/role-service";
import { RoleAssignmentService } from "@/domains/authorization/role-assignment-service";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { AccountSecurityService } from "@/domains/identity/account-security-service";
import { StaffAccountService } from "@/domains/identity/staff-account-service";
import { EmployeeAccountService } from "@/domains/identity/employee-account-service";
import { MfaService } from "@/domains/identity/mfa-service";
import { generateTotp, TOTP_STEP_SECONDS } from "@/server/auth/totp";
import { AuthorizationError, BusinessRuleError } from "@/shared/errors";

const PASSWORD = "harbor-lantern-73-mango";
const unique = () => `${Date.now()}-${Math.random()}`;

async function organization() {
  return (await OrganizationModel.create({ name: "Acme", slug: `acme-takeover-${unique()}` }))._id.toString();
}

async function staffWithRole(organizationId: string, permissionKeys: string[] = []) {
  const role = await RoleService.create({ organizationId, name: `Role ${unique()}`, permissionKeys, status: "active" }, {});
  const user = await StaffAccountService.create({ organizationId, firstName: "Ana", lastName: "Reyes", username: `ana.${unique()}`.slice(0, 30), password: PASSWORD, roleId: role._id.toString() }, {});
  return user._id.toString();
}

describe("administering accounts that reach beyond the organization", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("refuses to reset, unlock, disable or clear two-step for an account that also holds a role in another organization", async () => {
    const orgA = await organization();
    const orgB = await organization();
    const admin = await staffWithRole(orgA);
    const shared = await staffWithRole(orgA);
    const roleInB = await RoleService.create({ organizationId: orgB, name: `B ${unique()}`, permissionKeys: [], status: "active" }, {});
    await RoleAssignmentService.assign({ organizationId: orgB, roleId: roleInB._id.toString(), userId: shared }, {});
    const actor = { userId: admin };

    await expect(AccountSecurityService.resetPassword(shared, orgA, actor)).rejects.toThrow(AuthorizationError);
    await expect(AccountSecurityService.setStatus(shared, orgA, "disabled", actor)).rejects.toThrow(AuthorizationError);
    await expect(AccountSecurityService.unlock(shared, orgA, actor)).rejects.toThrow(AuthorizationError);
    await expect(AccountSecurityService.resetMfa(shared, orgA, actor)).rejects.toThrow(AuthorizationError);
    await expect(AccountSecurityService.assertCanAdminister(shared, orgA, actor)).rejects.toThrow(AuthorizationError);

    const fresh = await UserModel.findById(shared).lean();
    expect(await argon2.verify(fresh!.passwordHash, PASSWORD)).toBe(true);
    expect(fresh!.status).toBe("active");
  });

  it("refuses to act on a Super Administrator of another organization", async () => {
    const orgA = await organization();
    const orgB = await organization();
    const admin = await staffWithRole(orgA);
    const owner = await staffWithRole(orgA);
    // Revoke their only role in A, then make them B's Super Administrator: still tied to A by their person record.
    await RoleAssignmentModel.updateMany({ userId: owner, organizationId: orgA }, { $set: { effectiveTo: new Date(Date.now() - 1000) } });
    await SuperAdminService.ensure(orgB, owner);

    await expect(AccountSecurityService.resetPassword(owner, orgA, { userId: admin })).rejects.toThrow(AuthorizationError);
  });

  it("still lets an administrator act on an account that's theirs alone", async () => {
    const orgA = await organization();
    const admin = await staffWithRole(orgA);
    const staff = await staffWithRole(orgA);
    await expect(AccountSecurityService.resetPassword(staff, orgA, { userId: admin })).resolves.toMatchObject({ temporaryPassword: expect.any(String) });
    await expect(AccountSecurityService.unlock(staff, orgA, { userId: admin })).resolves.toBeUndefined();
    await expect(AccountSecurityService.resetMfa(staff, orgA, { userId: admin })).resolves.toBeUndefined();
  });
});

describe("staff accounts created with a role", () => {
  beforeEach(async () => {
    await connectMongoDB();
    for (const key of ["roles.assign", "staff-accounts.create", "payroll.approve"]) {
      await PermissionModel.findOneAndUpdate({ key }, { $setOnInsert: { key, description: key, category: "test" } }, { upsert: true });
    }
  });

  it("needs roles.assign as well as staff-accounts.create, and makes no account when refused", async () => {
    const organizationId = await organization();
    const creator = await staffWithRole(organizationId, ["staff-accounts.create"]);
    const role = await RoleService.create({ organizationId, name: `Plain ${unique()}`, permissionKeys: [], status: "active" }, {});
    const username = `new.${unique()}`.slice(0, 30);

    await expect(
      StaffAccountService.create({ organizationId, firstName: "New", lastName: "Hire", username, password: PASSWORD, roleId: role._id.toString() }, { userId: creator }),
    ).rejects.toThrow(AuthorizationError);
    expect(await UserModel.exists({ username })).toBeNull();
  });

  it("can't hand out a role with more access than the creator has", async () => {
    const organizationId = await organization();
    const creator = await staffWithRole(organizationId, ["staff-accounts.create", "roles.assign"]);
    const payroll = await RoleService.create({ organizationId, name: `Payroll ${unique()}`, permissionKeys: ["payroll.approve"], status: "active" }, {});
    const username = `pay.${unique()}`.slice(0, 30);

    await expect(
      StaffAccountService.create({ organizationId, firstName: "New", lastName: "Hire", username, password: PASSWORD, roleId: payroll._id.toString() }, { userId: creator }),
    ).rejects.toThrow(AuthorizationError);
    expect(await UserModel.exists({ username })).toBeNull();
  });

  it("returns only safe fields to send to the browser", async () => {
    const organizationId = await organization();
    const user = await StaffAccountService.create({ organizationId, firstName: "Bea", lastName: "Cruz", username: `bea.${unique()}`.slice(0, 30), password: PASSWORD }, {});
    const summary = StaffAccountService.toSummary(user);
    expect(summary).toEqual({ id: user._id.toString(), username: user.username, email: null, status: "active", mustChangePassword: true, createdAt: user.createdAt });
    expect(JSON.stringify(summary)).not.toContain("passwordHash");
  });
});

describe("serializing a user document", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("never includes the password hash, two-step secrets, WebAuthn challenge or session id", async () => {
    const user = await UserModel.create({
      username: `json.${unique()}`,
      passwordHash: await argon2.hash(PASSWORD),
      activeSessionId: "session-1",
      webAuthnChallenge: "challenge",
      webAuthnChallengeType: "registration",
      webAuthnChallengeExpiresAt: new Date(),
      mfa: { enabled: true, secret: "sealed", recoveryCodeHashes: ["a"] },
    });
    for (const serialized of [JSON.parse(JSON.stringify(user)), user.toObject(), user.toJSON()]) {
      expect(serialized).not.toHaveProperty("passwordHash");
      expect(serialized).not.toHaveProperty("mfa");
      expect(serialized).not.toHaveProperty("webAuthnChallenge");
      expect(serialized).not.toHaveProperty("activeSessionId");
      expect(serialized).toHaveProperty("username", user.username);
    }
    // The document itself (and lean reads) still have them for the code that needs them.
    expect(user.passwordHash).toBeTruthy();
    expect((await UserModel.findById(user._id).lean())!.passwordHash).toBeTruthy();
  });
});

describe("an employee's self-service account lookup", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("only answers for an employee of the given organization", async () => {
    const orgA = await organization();
    const orgB = await organization();
    const person = await PersonModel.create({ organizationId: orgA, firstName: "Jo", lastName: "Lee" });
    const employee = await EmployeeModel.create({ organizationId: orgA, personId: person._id, employeeNumber: `E-${unique()}` });
    await EmployeeAccountService.create({ organizationId: orgA, employeeId: employee._id.toString(), username: `jo.${unique()}`.slice(0, 30), password: PASSWORD }, {});

    expect(await EmployeeAccountService.getForEmployee(employee._id.toString(), orgA)).toMatchObject({ username: expect.any(String) });
    expect(await EmployeeAccountService.getForEmployee(employee._id.toString(), orgB)).toBeNull();
  });
});

describe("two-step verification while it's already on", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("can't be set up again (swapping in another phone) without turning it off first", async () => {
    const user = await UserModel.create({ username: `mfa.${unique()}`, passwordHash: await argon2.hash(PASSWORD) });
    const userId = user._id.toString();
    const enrolledAt = new Date(Date.now() - 10 * TOTP_STEP_SECONDS * 1000);
    const { secret } = await MfaService.startEnrollment(userId);
    await MfaService.confirmEnrollment(userId, generateTotp(secret, enrolledAt), { now: enrolledAt });

    await expect(MfaService.startEnrollment(userId)).rejects.toThrow(BusinessRuleError);
    await expect(MfaService.confirmEnrollment(userId, generateTotp(secret))).rejects.toThrow(BusinessRuleError);
    const fresh = await UserModel.findById(userId).lean();
    expect(fresh!.mfa?.pendingSecret).toBeFalsy();

    await MfaService.disable(userId, PASSWORD);
    await expect(MfaService.startEnrollment(userId)).resolves.toMatchObject({ secret: expect.any(String) });
  });
});

describe("changing a password", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("ends the account's session, so a copied cookie stops working, and returns the login to sign in again with", async () => {
    const user = await UserModel.create({ username: `pw.${unique()}`, passwordHash: await argon2.hash(PASSWORD), activeSessionId: "copied-session" });
    const result = await AccountSecurityService.changePassword(user._id.toString(), { currentPassword: PASSWORD, newPassword: "quiet-orchard-41-violet" });
    expect(result).toEqual({ login: user.username });
    expect((await UserModel.findById(user._id).lean())!.activeSessionId).toBeFalsy();
  });
});
