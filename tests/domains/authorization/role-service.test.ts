import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PermissionModel } from "@/server/db/models";
import { RoleService } from "@/domains/authorization/role-service";
import { authorize } from "@/server/authorization/authorize";
import { AuthorizationError, BusinessRuleError, ConflictError } from "@/shared/errors";
import { Types } from "mongoose";

async function seedPermission(key: string) {
  await PermissionModel.findOneAndUpdate({ key }, { $setOnInsert: { key, description: key, category: "test" } }, { upsert: true });
}

describe("RoleService", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await seedPermission("employees.read");
    await seedPermission("employees.update");
  });

  it("creates a role with a chosen set of permission keys", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-role-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();

    const role = await RoleService.create(
      { organizationId: orgId, name: "Building Administrator", description: "Manages building staff", permissionKeys: ["employees.read", "employees.update"], status: "active" },
      {},
    );

    expect(role.name).toBe("Building Administrator");
    expect(role.permissionKeys).toEqual(["employees.read", "employees.update"]);
  });

  it("rejects a permission key that isn't a real, seeded permission", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-role-bad-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();

    await expect(
      RoleService.create({ organizationId: orgId, name: "Bad Role", permissionKeys: ["not-a-real-permission"], status: "active" }, {}),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("rejects a duplicate role name within the same organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-role-dup-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    await RoleService.create({ organizationId: orgId, name: "Building Administrator", permissionKeys: [], status: "active" }, {});

    await expect(
      RoleService.create({ organizationId: orgId, name: "Building Administrator", permissionKeys: [], status: "active" }, {}),
    ).rejects.toThrow(ConflictError);
  });

  it("fully updates a role's permission set and status", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-role-update-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const role = await RoleService.create({ organizationId: orgId, name: "Building Administrator", permissionKeys: ["employees.read"], status: "active" }, {});

    const updated = await RoleService.update(
      role._id.toString(),
      orgId,
      { name: "Building Administrator", description: "Now with update rights", permissionKeys: ["employees.read", "employees.update"], status: "active" },
      {},
    );

    expect(updated.permissionKeys).toEqual(["employees.read", "employees.update"]);
    expect(updated.description).toBe("Now with update rights");
  });

  it("lists roles for an organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-role-list-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    await RoleService.create({ organizationId: orgId, name: "Role A", permissionKeys: [], status: "active" }, {});
    await RoleService.create({ organizationId: orgId, name: "Role B", permissionKeys: [], status: "active" }, {});

    const roles = await RoleService.listCurrent(orgId);
    expect(roles).toHaveLength(2);
  });

  it("deactivating a role immediately stops it from granting its permissions", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-role-deactivate-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const role = await RoleService.create({ organizationId: orgId, name: "Building Administrator", permissionKeys: ["employees.update"], status: "active" }, {});

    const { RoleAssignmentModel } = await import("@/server/db/models");
    const userId = new Types.ObjectId().toString();
    await RoleAssignmentModel.create({ userId, roleId: role._id, organizationId: organization._id });

    await expect(authorize({ userId, organizationId: orgId, permission: "employees.update" })).resolves.not.toThrow();

    await RoleService.update(
      role._id.toString(),
      orgId,
      { name: "Building Administrator", permissionKeys: ["employees.update"], status: "inactive" },
      {},
    );

    await expect(authorize({ userId, organizationId: orgId, permission: "employees.update" })).rejects.toThrow(AuthorizationError);
  });
});
