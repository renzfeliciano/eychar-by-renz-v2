import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel, RoleModel, RoleAssignmentModel } from "@/server/db/models";
import { EmployeeAccountService } from "@/domains/identity/employee-account-service";
import { ConflictError, NotFoundError } from "@/shared/errors";

async function seedEmployee(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-acct-${suffix}-${Date.now()}-${Math.random()}` });
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
  const employee = await EmployeeModel.create({
    organizationId: organization._id,
    personId: person._id,
    employeeNumber: `EMP-${suffix}-${Date.now()}-${Math.random()}`,
  });
  return { organization, employee };
}

describe("EmployeeAccountService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates a self-service account linked to the employee, with a zero-permission role assignment", async () => {
    const { organization, employee } = await seedEmployee("1");

    const user = await EmployeeAccountService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), username: `jane.doe.${Date.now()}`, password: "correct-horse" },
      {},
    );

    expect(user.employeeId?.toString()).toBe(employee._id.toString());

    const role = await RoleModel.findOne({ organizationId: organization._id, name: "Employee Self-Service" });
    expect(role).toBeTruthy();
    expect(role?.permissionKeys).toHaveLength(0);

    const assignment = await RoleAssignmentModel.findOne({ userId: user._id, roleId: role?._id });
    expect(assignment).toBeTruthy();
  });

  it("reuses the same self-service role across multiple employees in the organization", async () => {
    const { organization, employee: employeeA } = await seedEmployee("2a");
    const person = await PersonModel.create({ organizationId: organization._id, firstName: "John", lastName: "Smith" });
    const employeeB = await EmployeeModel.create({
      organizationId: organization._id,
      personId: person._id,
      employeeNumber: `EMP-2b-${Date.now()}-${Math.random()}`,
    });

    await EmployeeAccountService.create(
      { organizationId: organization._id.toString(), employeeId: employeeA._id.toString(), username: `usera.${Date.now()}`, password: "correct-horse" },
      {},
    );
    await EmployeeAccountService.create(
      { organizationId: organization._id.toString(), employeeId: employeeB._id.toString(), username: `userb.${Date.now()}`, password: "correct-horse" },
      {},
    );

    const roles = await RoleModel.find({ organizationId: organization._id, name: "Employee Self-Service" });
    expect(roles).toHaveLength(1);
  });

  it("rejects an employee id that doesn't belong to the organization", async () => {
    const { organization: otherOrg, employee } = await seedEmployee("3");
    const organization = await OrganizationModel.create({ name: "Other", slug: `other-acct-${Date.now()}-${Math.random()}` });

    await expect(
      EmployeeAccountService.create(
        { organizationId: organization._id.toString(), employeeId: employee._id.toString(), username: `nobody.${Date.now()}`, password: "correct-horse" },
        {},
      ),
    ).rejects.toThrow(NotFoundError);
    expect(otherOrg).toBeTruthy();
  });

  it("rejects creating a second account for an employee that already has one", async () => {
    const { organization, employee } = await seedEmployee("4");
    await EmployeeAccountService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), username: `first.${Date.now()}`, password: "correct-horse" },
      {},
    );

    await expect(
      EmployeeAccountService.create(
        { organizationId: organization._id.toString(), employeeId: employee._id.toString(), username: `second.${Date.now()}`, password: "correct-horse" },
        {},
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("rejects a username that's already in use", async () => {
    const { organization, employee: employeeA } = await seedEmployee("5a");
    const person = await PersonModel.create({ organizationId: organization._id, firstName: "John", lastName: "Smith" });
    const employeeB = await EmployeeModel.create({
      organizationId: organization._id,
      personId: person._id,
      employeeNumber: `EMP-5b-${Date.now()}-${Math.random()}`,
    });
    const username = `shared.${Date.now()}`;
    await EmployeeAccountService.create(
      { organizationId: organization._id.toString(), employeeId: employeeA._id.toString(), username, password: "correct-horse" },
      {},
    );

    await expect(
      EmployeeAccountService.create({ organizationId: organization._id.toString(), employeeId: employeeB._id.toString(), username, password: "correct-horse" }, {}),
    ).rejects.toThrow(ConflictError);
  });

  it("returns null for an employee with no self-service account yet", async () => {
    const { organization, employee } = await seedEmployee("6");
    const account = await EmployeeAccountService.getForEmployee(employee._id.toString(), organization._id.toString());
    expect(account).toBeNull();
  });
});
