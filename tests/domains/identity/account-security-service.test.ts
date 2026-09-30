import { describe, it, expect, beforeEach } from "vitest";
import argon2 from "argon2";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, OrganizationModel, UserModel } from "@/server/db/models";
import { RoleService } from "@/domains/authorization/role-service";
import { StaffAccountService } from "@/domains/identity/staff-account-service";
import { AccountSecurityService } from "@/domains/identity/account-security-service";
import { MfaService } from "@/domains/identity/mfa-service";
import { RoleAssignmentService } from "@/domains/authorization/role-assignment-service";
import { generateTotp } from "@/server/auth/totp";
import { checkPassword } from "@/shared/validation/password-policy";
import { AuthorizationError, NotFoundError, ValidationError } from "@/shared/errors";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";

const PASSWORD = "harbor-lantern-73-mango";

async function makeStaff(organizationId?: string) {
  const orgId = organizationId ?? (await OrganizationModel.create({ name: "Acme", slug: `acme-acct-${Date.now()}-${Math.random()}` }))._id.toString();
  const role = await RoleService.create({ organizationId: orgId, name: `HR ${Math.random()}`, permissionKeys: [], status: "active" }, {});
  const user = await StaffAccountService.create(
    { organizationId: orgId, firstName: "Ana", lastName: "Reyes", username: `ana.${Date.now()}.${Math.random()}`.slice(0, 30), password: PASSWORD, roleId: role._id.toString() },
    {},
  );
  return { user, organizationId: orgId };
}

describe("AccountSecurityService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("new accounts made by an administrator must choose their own password", async () => {
    const { user } = await makeStaff();
    expect(user.mustChangePassword).toBe(true);
  });

  it("changes a password after checking the current one", async () => {
    const { user, organizationId } = await makeStaff();
    const userId = user._id.toString();

    await expect(AccountSecurityService.changePassword(userId, { currentPassword: "wrong-one-entirely", newPassword: "quiet-orchard-41-violet" })).rejects.toBeInstanceOf(ValidationError);
    await expect(AccountSecurityService.changePassword(userId, { currentPassword: PASSWORD, newPassword: `${user.username}-2026-xyz` })).rejects.toBeInstanceOf(ValidationError);

    await AccountSecurityService.changePassword(userId, { currentPassword: PASSWORD, newPassword: "quiet-orchard-41-violet" });
    const fresh = await UserModel.findById(userId).lean();
    expect(await argon2.verify(fresh!.passwordHash, "quiet-orchard-41-violet")).toBe(true);
    expect(fresh!.mustChangePassword).toBe(false);
    expect(fresh!.passwordChangedAt).toBeTruthy();
    expect(await AuditLogModel.exists({ organizationId, action: "auth.password-changed", resourceId: user._id })).toBeTruthy();
  });

  it("an administrator's reset issues a policy-compliant temporary password, forces a change, unlocks and signs out", async () => {
    const { user, organizationId } = await makeStaff();
    await UserModel.updateOne({ _id: user._id }, { $set: { mustChangePassword: false, activeSessionId: "old-session", lockedUntil: new Date(Date.now() + 600_000) } });

    const { temporaryPassword } = await AccountSecurityService.resetPassword(user._id.toString(), organizationId, { userId: undefined });
    expect(checkPassword(temporaryPassword)).toEqual([]);

    const fresh = await UserModel.findById(user._id).lean();
    expect(await argon2.verify(fresh!.passwordHash, temporaryPassword)).toBe(true);
    expect(fresh!.mustChangePassword).toBe(true);
    expect(fresh!.activeSessionId).toBeFalsy();
    expect(fresh!.lockedUntil).toBeFalsy();
  });

  it("disables and re-enables an account, ending its session", async () => {
    const { user, organizationId } = await makeStaff();
    await UserModel.updateOne({ _id: user._id }, { $set: { activeSessionId: "live" } });

    await AccountSecurityService.setStatus(user._id.toString(), organizationId, "disabled", { userId: undefined });
    let fresh = await UserModel.findById(user._id).lean();
    expect(fresh!.status).toBe("disabled");
    expect(fresh!.activeSessionId).toBeFalsy();

    await AccountSecurityService.setStatus(user._id.toString(), organizationId, "active", { userId: undefined });
    fresh = await UserModel.findById(user._id).lean();
    expect(fresh!.status).toBe("active");
  });

  it("won't let an administrator act on an account outside their organization", async () => {
    const { user } = await makeStaff();
    const other = await OrganizationModel.create({ name: "Other", slug: `other-${Date.now()}-${Math.random()}` });
    await expect(AccountSecurityService.resetPassword(user._id.toString(), other._id.toString(), { userId: undefined })).rejects.toBeInstanceOf(NotFoundError);
    await expect(AccountSecurityService.setStatus(user._id.toString(), other._id.toString(), "disabled", { userId: undefined })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists the organization's accounts with their security state", async () => {
    const { user, organizationId } = await makeStaff();
    const { secret } = await MfaService.startEnrollment(user._id.toString());
    await MfaService.confirmEnrollment(user._id.toString(), generateTotp(secret));
    await UserModel.updateOne({ _id: user._id }, { $set: { lockedUntil: new Date(Date.now() + 600_000) } });

    const accounts = await AccountSecurityService.listForOrganization(organizationId);
    const row = accounts.find((account) => account.id === user._id.toString());
    expect(row).toMatchObject({ kind: "staff", status: "active", mfaEnabled: true, locked: true, mustChangePassword: true, displayName: "Ana Reyes" });
  });
});

describe("staff accounts created without a role", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("still belong to the organization: they're listed on Accounts and can be picked for a role", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-norole-${Date.now()}-${Math.random()}` });
    const organizationId = organization._id.toString();
    const user = await StaffAccountService.create(
      { organizationId, firstName: "Rosa", lastName: "Dizon", username: `rosa.${Date.now()}`.slice(0, 30), password: PASSWORD },
      {},
    );

    const accounts = await AccountSecurityService.listForOrganization(organizationId);
    expect(accounts.map((account) => account.id)).toContain(user._id.toString());

    const members = await RoleAssignmentService.listOrganizationMembers(organizationId);
    expect(members).toContainEqual(expect.objectContaining({ userId: user._id.toString(), name: "Rosa Dizon" }));

    const otherOrganization = await OrganizationModel.create({ name: "Other", slug: `other-norole-${Date.now()}-${Math.random()}` });
    expect((await AccountSecurityService.listForOrganization(otherOrganization._id.toString())).map((account) => account.id)).not.toContain(user._id.toString());
  });
});

describe("renaming accounts", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  async function setup() {
    const { user: hrUser, organizationId } = await makeStaff();
    const owner = await StaffAccountService.create(
      { organizationId, firstName: "Renzy", lastName: "Tester", username: `owner.${Date.now()}`.slice(0, 30), password: PASSWORD },
      {},
    );
    await SuperAdminService.ensure(organizationId, owner._id.toString());
    const staff = await StaffAccountService.create({ organizationId, firstName: "Rosa", lastName: "Dizon", username: `rosa.${Date.now()}`.slice(0, 30), password: PASSWORD }, {});
    return { organizationId, hr: hrUser._id.toString(), owner: owner._id.toString(), staff: staff._id.toString() };
  }

  it("lets an administrator rename a staff account, and audits it", async () => {
    const s = await setup();

    await AccountSecurityService.rename(s.staff, s.organizationId, { firstName: "Rosalie", lastName: "Dizon-Cruz" }, { userId: s.hr });

    const accounts = await AccountSecurityService.listForOrganization(s.organizationId);
    expect(accounts.find((account) => account.id === s.staff)?.displayName).toBe("Rosalie Dizon-Cruz");
    expect(await AuditLogModel.countDocuments({ resourceId: s.staff, action: "account.renamed" })).toBe(1);
  });

  it("lets the Super Administrator rename their own account, but not anyone else touch it", async () => {
    const s = await setup();

    await AccountSecurityService.rename(s.owner, s.organizationId, { firstName: "Renzo", lastName: "Payod" }, { userId: s.owner });
    await expect(AccountSecurityService.rename(s.owner, s.organizationId, { firstName: "X", lastName: "Y" }, { userId: s.hr })).rejects.toThrow(AuthorizationError);
    await expect(AccountSecurityService.assertCanAdminister(s.owner, s.organizationId, { userId: s.hr })).rejects.toThrow(AuthorizationError);
    await expect(AccountSecurityService.assertCanAdminister(s.staff, s.organizationId, { userId: s.hr })).resolves.toBeUndefined();
  });

  it("requires both names", async () => {
    const s = await setup();
    await expect(AccountSecurityService.rename(s.staff, s.organizationId, { firstName: " ", lastName: "Dizon" }, { userId: s.hr })).rejects.toThrow(ValidationError);
  });
});
