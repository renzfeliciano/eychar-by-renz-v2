import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, RoleAssignmentModel, RoleModel, UserModel, PermissionModel } from "@/server/db/models";
import { RoleService } from "@/domains/authorization/role-service";
import { RoleAssignmentService } from "@/domains/authorization/role-assignment-service";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { authorize } from "@/server/authorization/authorize";
import { AuthorizationError, BusinessRuleError } from "@/shared/errors";

async function seed() {
  for (const key of ["roles.create", "roles.update", "roles.assign", "users.update", "employees.read"]) {
    await PermissionModel.findOneAndUpdate({ key }, { $setOnInsert: { key, description: key, category: "test" } }, { upsert: true });
  }
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-sa-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  const owner = await UserModel.create({ username: `owner.${Date.now()}.${Math.random()}`, passwordHash: "x" });
  const hr = await UserModel.create({ username: `hr.${Date.now()}.${Math.random()}`, passwordHash: "x" });
  // A staff account of this organization with no role yet (assigning a role needs the account to belong here already).
  const otherPerson = await PersonModel.create({ organizationId: organization._id, firstName: "Other", lastName: "Staff" });
  const other = await UserModel.create({ username: `other.${Date.now()}.${Math.random()}`, passwordHash: "x", personId: otherPerson._id });
  const hrRole = await RoleService.create({ organizationId, name: "HR Administrator", permissionKeys: ["roles.create", "roles.update", "roles.assign", "users.update", "employees.read"], status: "active" }, {});
  const staffRole = await RoleService.create({ organizationId, name: "Staff", permissionKeys: ["employees.read"], status: "active" }, {});
  await RoleAssignmentService.assign({ organizationId, roleId: hrRole._id.toString(), userId: hr._id.toString() }, {});
  const superRole = await SuperAdminService.ensure(organizationId, owner._id.toString());
  return { organizationId, owner: owner._id.toString(), hr: hr._id.toString(), other: other._id.toString(), hrRoleId: hrRole._id.toString(), staffRoleId: staffRole._id.toString(), superRoleId: superRole._id.toString() };
}

describe("Super Administrator", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("passes every permission check, including ones no role lists", async () => {
    const s = await seed();
    await expect(authorize({ userId: s.owner, organizationId: s.organizationId, permission: "some.future-permission" })).resolves.toBeUndefined();
    await expect(authorize({ userId: s.hr, organizationId: s.organizationId, permission: "some.future-permission" })).rejects.toThrow(AuthorizationError);
    expect(await SuperAdminService.isSuperAdmin(s.owner, s.organizationId)).toBe(true);
    expect(await SuperAdminService.isSuperAdmin(s.hr, s.organizationId)).toBe(false);
  });

  it("stays one and only: ensure() is idempotent and never moves it to someone else", async () => {
    const s = await seed();
    await SuperAdminService.ensure(s.organizationId, s.owner);
    await expect(SuperAdminService.ensure(s.organizationId, s.other)).rejects.toThrow(BusinessRuleError);

    expect(await RoleModel.countDocuments({ organizationId: s.organizationId, system: "super_admin" })).toBe(1);
    expect(await RoleAssignmentModel.countDocuments({ organizationId: s.organizationId, roleId: s.superRoleId })).toBe(1);
  });

  it("can't be assigned, revoked, edited or recreated from the app, even by the super admin", async () => {
    const s = await seed();
    const assignment = await RoleAssignmentModel.findOne({ roleId: s.superRoleId }).lean();

    await expect(RoleAssignmentService.assign({ organizationId: s.organizationId, roleId: s.superRoleId, userId: s.other }, { userId: s.owner })).rejects.toThrow(BusinessRuleError);
    await expect(RoleAssignmentService.revoke(assignment!._id.toString(), s.organizationId, { userId: s.owner })).rejects.toThrow(BusinessRuleError);
    await expect(RoleService.update(s.superRoleId, s.organizationId, { name: "X", permissionKeys: [], status: "active" }, { userId: s.owner })).rejects.toThrow(BusinessRuleError);
  });

  it("reserves the name: no other role can be called Super Admin (or a look-alike)", async () => {
    const s = await seed();
    for (const name of ["Super Administrator", "Super Admin", "super-admin", "SUPERADMIN"]) {
      await expect(RoleService.create({ organizationId: s.organizationId, name, permissionKeys: [], status: "active" }, { userId: s.owner })).rejects.toThrow(BusinessRuleError);
    }
  });

  it("keeps delete access for the Super Administrator alone: no role can carry a delete permission", async () => {
    const s = await seed();
    await PermissionModel.findOneAndUpdate({ key: "records.delete" }, { $setOnInsert: { key: "records.delete", description: "Delete records", category: "test" } }, { upsert: true });

    await expect(RoleService.create({ organizationId: s.organizationId, name: "Cleaner", permissionKeys: ["records.delete"], status: "active" }, { userId: s.owner })).rejects.toThrow(BusinessRuleError);
    await expect(authorize({ userId: s.owner, organizationId: s.organizationId, permission: "records.delete" })).resolves.toBeUndefined();
    await expect(authorize({ userId: s.hr, organizationId: s.organizationId, permission: "records.delete" })).rejects.toThrow(AuthorizationError);
    expect((await RoleService.listAvailablePermissions()).some((permission) => permission.key === "records.delete")).toBe(false);
  });

  describe("admin roles are the super admin's to manage", () => {
    it("HR can't create or edit a role that grants admin power", async () => {
      const s = await seed();

      await expect(RoleService.create({ organizationId: s.organizationId, name: "Admin 2", permissionKeys: ["roles.assign"], status: "active" }, { userId: s.hr })).rejects.toThrow(AuthorizationError);
      await expect(RoleService.update(s.staffRoleId, s.organizationId, { name: "Staff", permissionKeys: ["employees.read", "users.update"], status: "active" }, { userId: s.hr })).rejects.toThrow(
        AuthorizationError,
      );
      // Ordinary roles are still HR's to manage.
      await expect(RoleService.create({ organizationId: s.organizationId, name: "Viewer", permissionKeys: ["employees.read"], status: "active" }, { userId: s.hr })).resolves.toBeTruthy();
    });

    it("HR can't give anyone an admin role or take one away, but can assign ordinary roles", async () => {
      const s = await seed();

      await expect(RoleAssignmentService.assign({ organizationId: s.organizationId, roleId: s.hrRoleId, userId: s.other }, { userId: s.hr })).rejects.toThrow(AuthorizationError);
      const hrAssignment = await RoleAssignmentModel.findOne({ roleId: s.hrRoleId, userId: s.hr }).lean();
      await expect(RoleAssignmentService.revoke(hrAssignment!._id.toString(), s.organizationId, { userId: s.hr })).rejects.toThrow(AuthorizationError);
      await expect(RoleAssignmentService.assign({ organizationId: s.organizationId, roleId: s.staffRoleId, userId: s.other }, { userId: s.hr })).resolves.toBeTruthy();
    });

    it("the super admin can create admin roles and assign them", async () => {
      const s = await seed();

      const role = await RoleService.create({ organizationId: s.organizationId, name: "Admin 2", permissionKeys: ["roles.assign"], status: "active" }, { userId: s.owner });
      await expect(RoleAssignmentService.assign({ organizationId: s.organizationId, roleId: role._id.toString(), userId: s.other }, { userId: s.owner })).resolves.toBeTruthy();
    });
  });
});
