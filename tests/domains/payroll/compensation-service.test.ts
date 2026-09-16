import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel } from "@/server/db/models";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { ConflictError } from "@/shared/errors";

async function seedEmployee(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-comp-${suffix}-${Date.now()}-${Math.random()}` });
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
  const employee = await EmployeeModel.create({
    organizationId: organization._id,
    personId: person._id,
    employeeNumber: `EMP-${suffix}-${Date.now()}-${Math.random()}`,
  });
  return { organization, employee };
}

describe("CompensationService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates an initial compensation grant", async () => {
    const { organization, employee } = await seedEmployee("1");

    const compensation = await CompensationService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), baseSalary: 30000, allowanceAmount: 2000 },
      {},
    );

    expect(compensation.baseSalary).toBe(30000);
    expect(compensation.allowanceAmount).toBe(2000);
    expect(compensation.effectiveTo).toBeUndefined();
  });

  it("rejects a second open compensation grant for the same employee", async () => {
    const { organization, employee } = await seedEmployee("2");
    await CompensationService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), baseSalary: 30000 },
      {},
    );

    await expect(
      CompensationService.create(
        { organizationId: organization._id.toString(), employeeId: employee._id.toString(), baseSalary: 35000 },
        {},
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("revise() closes the current row and creates a new one, preserving history", async () => {
    const { organization, employee } = await seedEmployee("3");
    const now = new Date();
    const revisionDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const afterRevision = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
    const beforeRevision = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

    const first = await CompensationService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), baseSalary: 30000 },
      {},
    );

    const revised = await CompensationService.revise(
      employee._id.toString(),
      organization._id.toString(),
      { baseSalary: 35000, allowanceAmount: 1500, effectiveFrom: revisionDate },
      {},
    );

    expect(revised.baseSalary).toBe(35000);
    expect(revised._id.toString()).not.toBe(first._id.toString());

    const historicalFirst = await CompensationService.getAsOf(employee._id.toString(), beforeRevision);
    expect(historicalFirst?._id.toString()).toBe(first._id.toString());
    expect(historicalFirst?.baseSalary).toBe(30000);

    const historicalRevised = await CompensationService.getAsOf(employee._id.toString(), afterRevision);
    expect(historicalRevised?._id.toString()).toBe(revised._id.toString());
    expect(historicalRevised?.baseSalary).toBe(35000);
  });

  it("getAsOf returns null when no compensation was effective on that date", async () => {
    const { employee } = await seedEmployee("4");
    const result = await CompensationService.getAsOf(employee._id.toString(), new Date("2020-01-01"));
    expect(result).toBeNull();
  });
});
