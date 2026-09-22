import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel } from "@/server/db/models";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { HireService } from "@/domains/workforce/hire-service";
import { ConflictError, NotFoundError } from "@/shared/errors";

describe("EmployeeService", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await Promise.all([
      OrganizationModel.deleteMany({}),
      PersonModel.deleteMany({}),
      EmployeeModel.deleteMany({}),
    ]);
  });

  it("creates an employee linked to a person in the same organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-emp-1" });
    const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });

    const employee = await EmployeeService.create(
      { organizationId: organization._id.toString(), personId: person._id.toString(), employeeNumber: "EMP-001" },
      {},
    );

    expect(employee.employeeNumber).toBe("EMP-001");
  });

  it("rejects a person that belongs to a different organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-emp-2" });
    const otherOrganization = await OrganizationModel.create({ name: "Other", slug: "other-emp-2" });
    const foreignPerson = await PersonModel.create({ organizationId: otherOrganization._id, firstName: "Foreign", lastName: "Person" });

    await expect(
      EmployeeService.create(
        { organizationId: organization._id.toString(), personId: foreignPerson._id.toString(), employeeNumber: "EMP-002" },
        {},
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects a duplicate employeeNumber within the same organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-emp-3" });
    const personA = await PersonModel.create({ organizationId: organization._id, firstName: "A", lastName: "A" });
    const personB = await PersonModel.create({ organizationId: organization._id, firstName: "B", lastName: "B" });
    await EmployeeService.create(
      { organizationId: organization._id.toString(), personId: personA._id.toString(), employeeNumber: "EMP-DUP" },
      {},
    );

    await expect(
      EmployeeService.create(
        { organizationId: organization._id.toString(), personId: personB._id.toString(), employeeNumber: "EMP-DUP" },
        {},
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("allows two employees in the same organization to both have no employee number", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-emp-5" });
    const personA = await PersonModel.create({ organizationId: organization._id, firstName: "No", lastName: "Number A" });
    const personB = await PersonModel.create({ organizationId: organization._id, firstName: "No", lastName: "Number B" });

    const employeeA = await EmployeeService.create(
      { organizationId: organization._id.toString(), personId: personA._id.toString() },
      {},
    );
    const employeeB = await EmployeeService.create(
      { organizationId: organization._id.toString(), personId: personB._id.toString() },
      {},
    );

    expect(employeeA.employeeNumber).toBeUndefined();
    expect(employeeB.employeeNumber).toBeUndefined();
  });

  it("updates an employee's employee number", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-emp-6" });
    const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
    const employee = await EmployeeService.create(
      { organizationId: organization._id.toString(), personId: person._id.toString(), employeeNumber: "EMP-006" },
      {},
    );

    const updated = await EmployeeService.update(
      employee._id.toString(),
      organization._id.toString(),
      { employeeNumber: "EMP-006-B" },
      {},
    );

    expect(updated.employeeNumber).toBe("EMP-006-B");
  });

  it("allows re-saving an employee's own unchanged employee number", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-emp-7" });
    const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
    const employee = await EmployeeService.create(
      { organizationId: organization._id.toString(), personId: person._id.toString(), employeeNumber: "EMP-007" },
      {},
    );

    const updated = await EmployeeService.update(
      employee._id.toString(),
      organization._id.toString(),
      { employeeNumber: "EMP-007" },
      {},
    );

    expect(updated.employeeNumber).toBe("EMP-007");
  });

  it("clears an employee's employee number when patched with an empty string", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-emp-9" });
    const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
    const employee = await EmployeeService.create(
      { organizationId: organization._id.toString(), personId: person._id.toString(), employeeNumber: "EMP-009" },
      {},
    );

    const updated = await EmployeeService.update(employee._id.toString(), organization._id.toString(), { employeeNumber: "" }, {});

    expect(updated.employeeNumber).toBeUndefined();
  });

  it("rejects updating to another employee's employee number", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-emp-8" });
    const personA = await PersonModel.create({ organizationId: organization._id, firstName: "A", lastName: "A" });
    const personB = await PersonModel.create({ organizationId: organization._id, firstName: "B", lastName: "B" });
    await EmployeeService.create(
      { organizationId: organization._id.toString(), personId: personA._id.toString(), employeeNumber: "EMP-008-A" },
      {},
    );
    const employeeB = await EmployeeService.create(
      { organizationId: organization._id.toString(), personId: personB._id.toString(), employeeNumber: "EMP-008-B" },
      {},
    );

    await expect(
      EmployeeService.update(employeeB._id.toString(), organization._id.toString(), { employeeNumber: "EMP-008-A" }, {}),
    ).rejects.toThrow(ConflictError);
  });

  it("lists employees with their current employment status and assignment", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-emp-4" });

    await HireService.hire(
      {
        organizationId: organization._id.toString(),
        firstName: "Jane",
        lastName: "Doe",
        employeeNumber: "EMP-004",
        employmentType: "regular",
      },
      {},
    );

    const roster = await EmployeeService.listWithCurrentStatus(organization._id.toString());
    expect(roster).toHaveLength(1);
    expect(roster[0].employeeNumber).toBe("EMP-004");
    expect(roster[0].person?.firstName).toBe("Jane");
    expect(roster[0].currentEmployment?.status).toBe("active");
  });
});
