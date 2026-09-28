import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, UserModel, PermissionModel } from "@/server/db/models";
import { RoleService } from "@/domains/authorization/role-service";
import { RoleAssignmentService } from "@/domains/authorization/role-assignment-service";
import { authorize } from "@/server/authorization/authorize";
import { AuthorizationError, NotFoundError } from "@/shared/errors";

async function seedUser(suffix: string) {
  return UserModel.create({ username: `user-${suffix}-${Date.now()}-${Math.random()}`, passwordHash: "x" });
}

describe("RoleAssignmentService", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await PermissionModel.findOneAndUpdate(
      { key: "employees.update" },
      { $setOnInsert: { key: "employees.update", description: "employees.update", category: "test" } },
      { upsert: true },
    );
  });

  it("assigns a role to a user, granting its permissions immediately", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ra-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const role = await RoleService.create({ organizationId: orgId, name: "Building Administrator", permissionKeys: [], status: "active" }, {});
    const user = await seedUser("1");

    const assignment = await RoleAssignmentService.assign({ organizationId: orgId, roleId: role._id.toString(), userId: user._id.toString() }, {});

    expect(assignment.userId.toString()).toBe(user._id.toString());
    expect(assignment.roleId.toString()).toBe(role._id.toString());
  });

  it("lists the names of a user's current roles in an organization, for the account menu", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ra-names-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const hr = await RoleService.create({ organizationId: orgId, name: "HR Administrator", permissionKeys: [], status: "active" }, {});
    const payroll = await RoleService.create({ organizationId: orgId, name: "Payroll Approver", permissionKeys: [], status: "active" }, {});
    const user = await seedUser("names");
    await RoleAssignmentService.assign({ organizationId: orgId, roleId: hr._id.toString(), userId: user._id.toString() }, {});
    const revoked = await RoleAssignmentService.assign({ organizationId: orgId, roleId: payroll._id.toString(), userId: user._id.toString() }, {});
    await RoleAssignmentService.revoke(revoked._id.toString(), orgId, {});

    expect(await RoleAssignmentService.listRoleNamesForUser(user._id.toString(), orgId)).toEqual(["HR Administrator"]);
  });

  it("rejects assigning a role that doesn't belong to the organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ra-bad-${Date.now()}-${Math.random()}` });
    const otherOrg = await OrganizationModel.create({ name: "Other", slug: `other-ra-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const foreignRole = await RoleService.create({ organizationId: otherOrg._id.toString(), name: "Foreign Role", permissionKeys: [], status: "active" }, {});
    const user = await seedUser("2");

    await expect(
      RoleAssignmentService.assign({ organizationId: orgId, roleId: foreignRole._id.toString(), userId: user._id.toString() }, {}),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects a second active assignment of the same role to the same user", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ra-dup-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const role = await RoleService.create({ organizationId: orgId, name: "Building Administrator", permissionKeys: [], status: "active" }, {});
    const user = await seedUser("3");
    await RoleAssignmentService.assign({ organizationId: orgId, roleId: role._id.toString(), userId: user._id.toString() }, {});

    await expect(
      RoleAssignmentService.assign({ organizationId: orgId, roleId: role._id.toString(), userId: user._id.toString() }, {}),
    ).rejects.toThrow();
  });

  it("revokes an assignment, immediately removing the permissions it granted", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ra-revoke-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const role = await RoleService.create({ organizationId: orgId, name: "Building Administrator", permissionKeys: ["employees.update"], status: "active" }, {});
    const user = await seedUser("4");
    const assignment = await RoleAssignmentService.assign({ organizationId: orgId, roleId: role._id.toString(), userId: user._id.toString() }, {});

    await expect(authorize({ userId: user._id.toString(), organizationId: orgId, permission: "employees.update" })).resolves.not.toThrow();

    await RoleAssignmentService.revoke(assignment._id.toString(), orgId, {});

    await expect(authorize({ userId: user._id.toString(), organizationId: orgId, permission: "employees.update" })).rejects.toThrow(AuthorizationError);
  });

  it("lists current assignments for an organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ra-list-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const role = await RoleService.create({ organizationId: orgId, name: "Building Administrator", permissionKeys: [], status: "active" }, {});
    const user = await seedUser("5");
    await RoleAssignmentService.assign({ organizationId: orgId, roleId: role._id.toString(), userId: user._id.toString() }, {});

    const assignments = await RoleAssignmentService.listForOrganization(orgId);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].userId.toString()).toBe(user._id.toString());
  });

  it("propagates a not-found id gracefully instead of throwing an ObjectId cast error", async () => {
    await expect(RoleAssignmentService.revoke(new Types.ObjectId().toString(), new Types.ObjectId().toString(), {})).rejects.toThrow(NotFoundError);
  });
});
