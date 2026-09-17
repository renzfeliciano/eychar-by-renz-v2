import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel } from "@/server/db/models";
import { TravelOrderService } from "@/domains/travel-orders/travel-order-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";

async function seedEmployee(organizationId: object, suffix: string) {
  const person = await PersonModel.create({ organizationId, firstName: `First${suffix}`, lastName: `Last${suffix}` });
  return EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${suffix}-${Date.now()}-${Math.random()}` });
}

describe("TravelOrderService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("dispatches one or more employees for a date range", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-to-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const employeeA = await seedEmployee(organization._id, "A");
    const employeeB = await seedEmployee(organization._id, "B");

    const order = await TravelOrderService.create(
      {
        organizationId: orgId,
        employeeIds: [employeeA._id.toString(), employeeB._id.toString()],
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-03-05"),
        remarks: "Year-end audit — Cebu branch",
      },
      {},
    );

    expect(order.employeeIds).toHaveLength(2);
    expect(order.status).toBe("scheduled");
  });

  it("rejects an employee id that doesn't belong to the organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-to-bad-${Date.now()}-${Math.random()}` });
    const otherOrg = await OrganizationModel.create({ name: "Other", slug: `other-to-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const foreignEmployee = await seedEmployee(otherOrg._id, "FOREIGN");

    await expect(
      TravelOrderService.create(
        { organizationId: orgId, employeeIds: [foreignEmployee._id.toString()], startDate: new Date("2026-03-01"), endDate: new Date("2026-03-05") },
        {},
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects an end date before the start date", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-to-dates-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const employee = await seedEmployee(organization._id, "C");

    await expect(
      TravelOrderService.create(
        { organizationId: orgId, employeeIds: [employee._id.toString()], startDate: new Date("2026-03-05"), endDate: new Date("2026-03-01") },
        {},
      ),
    ).rejects.toThrow();
  });

  it("fully updates a travel order, including its employee list", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-to-update-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const employeeA = await seedEmployee(organization._id, "D");
    const employeeB = await seedEmployee(organization._id, "E");
    const order = await TravelOrderService.create(
      { organizationId: orgId, employeeIds: [employeeA._id.toString()], startDate: new Date("2026-03-01"), endDate: new Date("2026-03-05") },
      {},
    );

    const updated = await TravelOrderService.update(
      order._id.toString(),
      orgId,
      { employeeIds: [employeeA._id.toString(), employeeB._id.toString()], startDate: new Date("2026-03-02"), endDate: new Date("2026-03-06"), remarks: "Added a companion" },
      {},
    );

    expect(updated.employeeIds).toHaveLength(2);
    expect(updated.remarks).toBe("Added a companion");
  });

  it("cancels a travel order and rejects cancelling it twice", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-to-cancel-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const employee = await seedEmployee(organization._id, "F");
    const order = await TravelOrderService.create(
      { organizationId: orgId, employeeIds: [employee._id.toString()], startDate: new Date("2026-03-01"), endDate: new Date("2026-03-05") },
      {},
    );

    const cancelled = await TravelOrderService.cancel(order._id.toString(), orgId, {});
    expect(cancelled.status).toBe("cancelled");

    await expect(TravelOrderService.cancel(order._id.toString(), orgId, {})).rejects.toThrow(BusinessRuleError);
  });

  it("lists travel orders for an organization, most recent start date first", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-to-list-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const employee = await seedEmployee(organization._id, "G");
    await TravelOrderService.create(
      { organizationId: orgId, employeeIds: [employee._id.toString()], startDate: new Date("2026-01-01"), endDate: new Date("2026-01-02") },
      {},
    );
    await TravelOrderService.create(
      { organizationId: orgId, employeeIds: [employee._id.toString()], startDate: new Date("2026-06-01"), endDate: new Date("2026-06-02") },
      {},
    );

    const orders = await TravelOrderService.listCurrent(orgId);
    expect(orders).toHaveLength(2);
    expect(new Date(orders[0].startDate).getTime()).toBeGreaterThan(new Date(orders[1].startDate).getTime());
  });
});
