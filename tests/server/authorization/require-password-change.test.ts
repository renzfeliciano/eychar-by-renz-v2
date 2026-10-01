import { describe, it, expect, vi, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, OrganizationModel, PersonModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";
import { AuthorizationError } from "@/shared/errors";

const session = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: () => session() }));

const { requireAuthenticatedUser, requirePermission, requireSelfServiceEmployee } = await import("@/server/authorization/require");

async function seed() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-require-${Date.now()}-${Math.random()}` });
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jo", lastName: "Lee" });
  const employee = await EmployeeModel.create({ organizationId: organization._id, personId: person._id, employeeNumber: `E-${Date.now()}-${Math.random()}` });
  const user = await UserModel.create({ username: `req.${Date.now()}.${Math.random()}`, passwordHash: "x", employeeId: employee._id });
  const role = await RoleModel.create({ organizationId: organization._id, name: `R ${Math.random()}`, permissionKeys: ["employees.read"] });
  await RoleAssignmentModel.create({ organizationId: organization._id, roleId: role._id, userId: user._id });
  return { userId: user._id.toString(), organizationId: organization._id.toString() };
}

describe("a session still on a temporary password", () => {
  beforeEach(async () => {
    await connectMongoDB();
    session.mockReset();
  });

  it("is refused by every guard except the password-change route's opt-in", async () => {
    const { userId, organizationId } = await seed();
    session.mockResolvedValue({ user: { id: userId }, mustChangePassword: true });

    await expect(requireAuthenticatedUser()).rejects.toThrow(AuthorizationError);
    await expect(requireAuthenticatedUser()).rejects.toThrow(/temporary/);
    await expect(requirePermission("employees.read", organizationId)).rejects.toThrow(AuthorizationError);
    await expect(requireSelfServiceEmployee()).rejects.toThrow(AuthorizationError);
    await expect(requireAuthenticatedUser({ allowPendingPasswordChange: true })).resolves.toEqual({ userId });
  });

  it("passes once the password has been replaced", async () => {
    const { userId, organizationId } = await seed();
    session.mockResolvedValue({ user: { id: userId } });
    await expect(requirePermission("employees.read", organizationId)).resolves.toEqual({ userId });
    await expect(requireSelfServiceEmployee()).resolves.toMatchObject({ userId, organizationId });
  });
});

describe("a staff session that still has to set up required two-step verification", () => {
  beforeEach(async () => {
    await connectMongoDB();
    session.mockReset();
  });

  it("is refused everywhere except the two-step and password routes' opt-in", async () => {
    const { userId, organizationId } = await seed();
    session.mockResolvedValue({ user: { id: userId }, mustSetUpTwoStep: true });

    await expect(requireAuthenticatedUser()).rejects.toThrow(/two-step/);
    await expect(requirePermission("employees.read", organizationId)).rejects.toThrow(AuthorizationError);
    await expect(requireAuthenticatedUser({ allowPendingTwoStepSetup: true })).resolves.toEqual({ userId });
  });
});
