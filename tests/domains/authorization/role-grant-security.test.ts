import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PermissionModel, PersonModel, RoleAssignmentModel, UserModel } from "@/server/db/models";
import { RoleService } from "@/domains/authorization/role-service";
import { RoleAssignmentService } from "@/domains/authorization/role-assignment-service";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { organizationUserIds, userBelongsToOrganization } from "@/domains/identity/user-directory";
import { AuthorizationError, NotFoundError } from "@/shared/errors";

const KEYS = ["roles.assign", "employees.read", "payroll.read", "payroll.approve"];
const unique = () => `${Date.now()}-${Math.random()}`;

async function organization() {
  const org = await OrganizationModel.create({ name: "Acme", slug: `acme-grant-${unique()}` });
  return org._id.toString();
}

/** A staff account of `organizationId` with no role (a staff person record there). */
async function staffOf(organizationId: string) {
  const person = await PersonModel.create({ organizationId, firstName: "Staff", lastName: "Member" });
  return (await UserModel.create({ username: `staff.${unique()}`, passwordHash: "x", personId: person._id }))._id.toString();
}

async function seed() {
  for (const key of KEYS) await PermissionModel.findOneAndUpdate({ key }, { $setOnInsert: { key, description: key, category: "test" } }, { upsert: true });
  const organizationId = await organization();
  // An HR user who can assign roles and read employees, but not touch payroll.
  const hr = await staffOf(organizationId);
  const hrRole = await RoleService.create({ organizationId, name: `Assigner ${unique()}`, permissionKeys: ["roles.assign", "employees.read"], status: "active" }, {});
  await RoleAssignmentService.assign({ organizationId, roleId: hrRole._id.toString(), userId: hr }, {});
  const viewer = await RoleService.create({ organizationId, name: `Viewer ${unique()}`, permissionKeys: ["employees.read"], status: "active" }, {});
  const payroll = await RoleService.create({ organizationId, name: `Payroll ${unique()}`, permissionKeys: ["employees.read", "payroll.read", "payroll.approve"], status: "active" }, {});
  return { organizationId, hr, viewerRoleId: viewer._id.toString(), payrollRoleId: payroll._id.toString() };
}

describe("granting roles (cross-organization takeover and escalation)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("refuses to give a role to an account from another organization", async () => {
    const s = await seed();
    const otherOrg = await organization();
    const outsider = await staffOf(otherOrg);
    const otherRole = await RoleService.create({ organizationId: otherOrg, name: `Their HR ${unique()}`, permissionKeys: [], status: "active" }, {});
    await RoleAssignmentService.assign({ organizationId: otherOrg, roleId: otherRole._id.toString(), userId: outsider }, {});

    await expect(RoleAssignmentService.assign({ organizationId: s.organizationId, roleId: s.viewerRoleId, userId: outsider }, { userId: s.hr })).rejects.toThrow(NotFoundError);
    // A bare account with no organization at all can't be pulled in either.
    const bare = (await UserModel.create({ username: `bare.${unique()}`, passwordHash: "x" }))._id.toString();
    await expect(RoleAssignmentService.assign({ organizationId: s.organizationId, roleId: s.viewerRoleId, userId: bare }, { userId: s.hr })).rejects.toThrow(NotFoundError);
    expect(await RoleAssignmentModel.exists({ userId: outsider, organizationId: s.organizationId })).toBeNull();
  });

  it("lets HR give an ordinary role to an account already in the organization", async () => {
    const s = await seed();
    const member = await staffOf(s.organizationId);
    await expect(RoleAssignmentService.assign({ organizationId: s.organizationId, roleId: s.viewerRoleId, userId: member }, { userId: s.hr })).resolves.toBeTruthy();
  });

  it("refuses to grant a role carrying permissions the actor doesn't hold", async () => {
    const s = await seed();
    const member = await staffOf(s.organizationId);
    await expect(RoleAssignmentService.assign({ organizationId: s.organizationId, roleId: s.payrollRoleId, userId: member }, { userId: s.hr })).rejects.toThrow(AuthorizationError);
    expect(await RoleAssignmentModel.exists({ userId: member, roleId: s.payrollRoleId })).toBeNull();
  });

  it("lets the organization's Super Administrator grant any ordinary role", async () => {
    const s = await seed();
    const owner = await staffOf(s.organizationId);
    await SuperAdminService.ensure(s.organizationId, owner);
    const member = await staffOf(s.organizationId);
    await expect(RoleAssignmentService.assign({ organizationId: s.organizationId, roleId: s.payrollRoleId, userId: member }, { userId: owner })).resolves.toBeTruthy();
  });
});

describe("organization membership", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("ignores revoked and expired role assignments", async () => {
    const organizationId = await organization();
    const role = await RoleService.create({ organizationId, name: `Role ${unique()}`, permissionKeys: [], status: "active" }, {});
    const revokedUser = (await UserModel.create({ username: `revoked.${unique()}`, passwordHash: "x" }))._id.toString();
    const expiredUser = (await UserModel.create({ username: `expired.${unique()}`, passwordHash: "x" }))._id.toString();
    const activeUser = (await UserModel.create({ username: `active.${unique()}`, passwordHash: "x" }))._id.toString();

    const revoked = await RoleAssignmentService.assign({ organizationId, roleId: role._id.toString(), userId: revokedUser }, {});
    await RoleAssignmentService.revoke(revoked._id.toString(), organizationId, {});
    await RoleAssignmentModel.create({ organizationId, roleId: role._id, userId: expiredUser, effectiveFrom: new Date(Date.now() - 86_400_000), effectiveTo: new Date(Date.now() - 3_600_000) });
    await RoleAssignmentService.assign({ organizationId, roleId: role._id.toString(), userId: activeUser }, {});

    const ids = (await organizationUserIds(organizationId)).map(String);
    expect(ids).toContain(activeUser);
    expect(ids).not.toContain(revokedUser);
    expect(ids).not.toContain(expiredUser);
    expect(await userBelongsToOrganization(revokedUser, organizationId)).toBe(false);
    expect(await userBelongsToOrganization(activeUser, organizationId)).toBe(true);
  });
});
