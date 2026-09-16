import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import {
  OrganizationModel,
  UserModel,
  RoleModel,
  RoleAssignmentModel,
} from "@/server/db/models";
import { authorize } from "@/server/authorization/authorize";
import { AuthorizationError } from "@/shared/errors";

async function seedOrgUserRole(permissionKeys: string[]) {
  const organization = await OrganizationModel.create({
    name: "Acme",
    slug: `acme-${Date.now()}-${Math.random()}`,
  });
  const user = await UserModel.create({
    email: `user-${Date.now()}-${Math.random()}@example.com`,
    passwordHash: "hash",
  });
  const role = await RoleModel.create({
    organizationId: organization._id,
    name: "Test Role",
    permissionKeys,
  });
  return { organization, user, role };
}

describe("authorize", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await Promise.all([
      OrganizationModel.deleteMany({}),
      UserModel.deleteMany({}),
      RoleModel.deleteMany({}),
      RoleAssignmentModel.deleteMany({}),
    ]);
  });

  it("required test §60: org-scoped HR Administrator grants access to any project-scoped resource in that org", async () => {
    const { organization, user, role } = await seedOrgUserRole(["employees.read"]);
    await RoleAssignmentModel.create({
      userId: user._id,
      roleId: role._id,
      organizationId: organization._id,
      effectiveFrom: new Date(Date.now() - 1000),
    });

    await expect(
      authorize({
        userId: user._id.toString(),
        organizationId: organization._id.toString(),
        permission: "employees.read",
      }),
    ).resolves.toBeUndefined();
  });

  it("denies when the user has no role assignment in the organization", async () => {
    const { organization, user } = await seedOrgUserRole(["employees.read"]);

    await expect(
      authorize({
        userId: user._id.toString(),
        organizationId: organization._id.toString(),
        permission: "employees.read",
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("denies when the assigned role does not include the requested permission", async () => {
    const { organization, user, role } = await seedOrgUserRole(["leave.approve"]);
    await RoleAssignmentModel.create({
      userId: user._id,
      roleId: role._id,
      organizationId: organization._id,
      effectiveFrom: new Date(Date.now() - 1000),
    });

    await expect(
      authorize({
        userId: user._id.toString(),
        organizationId: organization._id.toString(),
        permission: "employees.read",
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("denies an expired role assignment (effectiveTo in the past)", async () => {
    const { organization, user, role } = await seedOrgUserRole(["employees.read"]);
    await RoleAssignmentModel.create({
      userId: user._id,
      roleId: role._id,
      organizationId: organization._id,
      effectiveFrom: new Date(Date.now() - 5000),
      effectiveTo: new Date(Date.now() - 1000),
    });

    await expect(
      authorize({
        userId: user._id.toString(),
        organizationId: organization._id.toString(),
        permission: "employees.read",
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("denies a not-yet-effective role assignment (effectiveFrom in the future)", async () => {
    const { organization, user, role } = await seedOrgUserRole(["employees.read"]);
    await RoleAssignmentModel.create({
      userId: user._id,
      roleId: role._id,
      organizationId: organization._id,
      effectiveFrom: new Date(Date.now() + 60_000),
    });

    await expect(
      authorize({
        userId: user._id.toString(),
        organizationId: organization._id.toString(),
        permission: "employees.read",
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("required test §60: a role assignment scoped to one organization does not grant access to a different organization", async () => {
    const orgA = await seedOrgUserRole(["employees.read"]);
    const otherOrganization = await OrganizationModel.create({
      name: "Other Org",
      slug: `other-${Date.now()}-${Math.random()}`,
    });
    await RoleAssignmentModel.create({
      userId: orgA.user._id,
      roleId: orgA.role._id,
      organizationId: orgA.organization._id,
      effectiveFrom: new Date(Date.now() - 1000),
    });

    await expect(
      authorize({
        userId: orgA.user._id.toString(),
        organizationId: otherOrganization._id.toString(),
        permission: "employees.read",
      }),
    ).rejects.toThrow(AuthorizationError);
  });
});
