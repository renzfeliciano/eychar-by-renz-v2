import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, RoleAssignmentModel } from "@/server/db/models";
import { RoleService } from "@/domains/authorization/role-service";
import { StaffAccountService } from "@/domains/identity/staff-account-service";
import { ConflictError } from "@/shared/errors";

describe("StaffAccountService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates a plain HR-shell login with no employeeId", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-staff-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();

    const user = await StaffAccountService.create(
      { organizationId: orgId, firstName: "Bea", lastName: "Cruz", username: `bea.cruz.${Date.now()}`, password: "correct-horse" },
      {},
    );

    expect(user.employeeId).toBeFalsy();
  });

  it("assigns the given role at creation time when one is provided", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-staff-role-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const role = await RoleService.create({ organizationId: orgId, name: "Building Administrator", permissionKeys: [], status: "active" }, {});

    const user = await StaffAccountService.create(
      { organizationId: orgId, firstName: "Bea", lastName: "Cruz", username: `bea.role.${Date.now()}`, password: "correct-horse", roleId: role._id.toString() },
      {},
    );

    const assignment = await RoleAssignmentModel.findOne({ userId: user._id, roleId: role._id });
    expect(assignment).toBeTruthy();
  });

  it("rejects a username that's already in use", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-staff-dup-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const username = `shared.${Date.now()}`;
    await StaffAccountService.create({ organizationId: orgId, firstName: "First", lastName: "One", username, password: "correct-horse" }, {});

    await expect(
      StaffAccountService.create({ organizationId: orgId, firstName: "Second", lastName: "Two", username, password: "correct-horse" }, {}),
    ).rejects.toThrow(ConflictError);
  });
});
