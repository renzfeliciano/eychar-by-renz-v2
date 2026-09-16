import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel } from "@/server/db/models";
import { EmploymentService } from "@/domains/workforce/employment-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";

async function seedEmployee(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-emt-${suffix}` });
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
  const employee = await EmployeeModel.create({
    organizationId: organization._id,
    personId: person._id,
    employeeNumber: `EMP-${suffix}`,
  });
  return { organization, employee };
}

describe("EmploymentService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("hires an employee with an open, active employment stint", async () => {
    const { organization, employee } = await seedEmployee("1");

    const employment = await EmploymentService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), employmentType: "regular" },
      {},
    );

    expect(employment.status).toBe("active");
    const current = await EmploymentService.getCurrent(employee._id.toString());
    expect(current?._id.toString()).toBe(employment._id.toString());
  });

  it("rejects hiring the same employee twice while a stint is already open", async () => {
    const { organization, employee } = await seedEmployee("2");
    await EmploymentService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), employmentType: "regular" },
      {},
    );

    await expect(
      EmploymentService.create(
        { organizationId: organization._id.toString(), employeeId: employee._id.toString(), employmentType: "regular" },
        {},
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("terminates an open employment stint and allows a later rehire", async () => {
    const { organization, employee } = await seedEmployee("3");
    const firstStint = await EmploymentService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), employmentType: "regular" },
      {},
    );

    const terminated = await EmploymentService.terminate(
      firstStint._id.toString(),
      organization._id.toString(),
      { terminationReason: "resigned" },
      {},
    );
    expect(terminated.status).toBe("terminated");
    expect(await EmploymentService.getCurrent(employee._id.toString())).toBeNull();

    const rehireStint = await EmploymentService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), employmentType: "contractual" },
      {},
    );
    expect(rehireStint.status).toBe("active");
    expect((await EmploymentService.getCurrent(employee._id.toString()))?._id.toString()).toBe(rehireStint._id.toString());
  });

  it("rejects terminating an employment record from a different organization", async () => {
    const { employee } = await seedEmployee("4");
    const otherOrganization = await OrganizationModel.create({ name: "Other", slug: "other-emt-4" });
    const employment = await EmploymentService.create(
      { organizationId: (await EmployeeModel.findById(employee._id))!.organizationId.toString(), employeeId: employee._id.toString(), employmentType: "regular" },
      {},
    );

    await expect(
      EmploymentService.terminate(employment._id.toString(), otherOrganization._id.toString(), {}, {}),
    ).rejects.toThrow(NotFoundError);
  });
});
