import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel, LeaveRequestModel, AuditLogModel } from "@/server/db/models";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { LeaveBalanceService } from "@/domains/leave/leave-balance-service";
import { ConflictError } from "@/shared/errors";

async function seedOrgEmployeeAndType(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-lb-${suffix}-${Date.now()}-${Math.random()}` });
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
  const employee = await EmployeeModel.create({
    organizationId: organization._id,
    personId: person._id,
    employeeNumber: `EMP-${suffix}-${Date.now()}-${Math.random()}`,
  });
  const leaveType = await LeaveTypeService.create(
    { organizationId: organization._id.toString(), name: "Vacation", code: `VAC-${suffix}` },
    {},
  );
  return { organization, employee, leaveType };
}

describe("LeaveBalanceService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates a balance and rejects a duplicate for the same employee/leaveType/year", async () => {
    const { organization, employee, leaveType } = await seedOrgEmployeeAndType("1");

    await LeaveBalanceService.create(
      {
        organizationId: organization._id.toString(),
        employeeId: employee._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        year: 2026,
        entitledDays: 15,
      },
      {},
    );

    await expect(
      LeaveBalanceService.create(
        {
          organizationId: organization._id.toString(),
          employeeId: employee._id.toString(),
          leaveTypeId: leaveType._id.toString(),
          year: 2026,
          entitledDays: 15,
        },
        {},
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("getAvailable nets entitlement + adjustment - approved usage only", async () => {
    const { organization, employee, leaveType } = await seedOrgEmployeeAndType("2");
    await LeaveBalanceService.create(
      {
        organizationId: organization._id.toString(),
        employeeId: employee._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        year: 2026,
        entitledDays: 15,
      },
      {},
    );

    await LeaveRequestModel.create({
      organizationId: organization._id,
      employeeId: employee._id,
      leaveTypeId: leaveType._id,
      startDate: new Date("2026-02-01"),
      endDate: new Date("2026-02-03"),
      totalDays: 3,
      status: "approved",
    });
    await LeaveRequestModel.create({
      organizationId: organization._id,
      employeeId: employee._id,
      leaveTypeId: leaveType._id,
      startDate: new Date("2026-03-01"),
      endDate: new Date("2026-03-05"),
      totalDays: 5,
      status: "pending",
    });
    await LeaveRequestModel.create({
      organizationId: organization._id,
      employeeId: employee._id,
      leaveTypeId: leaveType._id,
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-04-02"),
      totalDays: 2,
      status: "rejected",
    });

    const available = await LeaveBalanceService.getAvailable({
      organizationId: organization._id.toString(),
      employeeId: employee._id.toString(),
      leaveTypeId: leaveType._id.toString(),
      year: 2026,
    });

    expect(available).toBe(12);
  });

  it("getAvailable returns Infinity for a balance marked hasNoFixedAmount, regardless of usage", async () => {
    const { organization, employee, leaveType } = await seedOrgEmployeeAndType("4");
    await LeaveBalanceService.create(
      {
        organizationId: organization._id.toString(),
        employeeId: employee._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        year: 2026,
        hasNoFixedAmount: true,
      },
      {},
    );

    await LeaveRequestModel.create({
      organizationId: organization._id,
      employeeId: employee._id,
      leaveTypeId: leaveType._id,
      startDate: new Date("2026-02-01"),
      endDate: new Date("2026-02-20"),
      totalDays: 20,
      status: "approved",
    });

    const available = await LeaveBalanceService.getAvailable({
      organizationId: organization._id.toString(),
      employeeId: employee._id.toString(),
      leaveTypeId: leaveType._id.toString(),
      year: 2026,
    });

    expect(available).toBe(Infinity);
  });

  it("adjust() changes adjustmentDays and audits before/after", async () => {
    const { organization, employee, leaveType } = await seedOrgEmployeeAndType("3");
    const balance = await LeaveBalanceService.create(
      {
        organizationId: organization._id.toString(),
        employeeId: employee._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        year: 2026,
        entitledDays: 15,
      },
      {},
    );

    const adjusted = await LeaveBalanceService.adjust(
      balance._id.toString(),
      organization._id.toString(),
      { adjustmentDays: 2 },
      {},
    );

    expect(adjusted.adjustmentDays).toBe(2);
    const audits = await AuditLogModel.find({ resourceId: balance._id, action: "leave-balance.adjusted" }).lean();
    expect(audits).toHaveLength(1);
    expect(audits[0].before).toMatchObject({ adjustmentDays: 0 });
    expect(audits[0].after).toMatchObject({ adjustmentDays: 2 });
  });

  it("listForEmployee returns only that employee's balances, across all years", async () => {
    const { organization, employee, leaveType } = await seedOrgEmployeeAndType("5");
    const otherEmployee = await EmployeeModel.create({
      organizationId: organization._id,
      personId: (await PersonModel.create({ organizationId: organization._id, firstName: "Other", lastName: "Person" }))._id,
      employeeNumber: `EMP-5-OTHER-${Date.now()}-${Math.random()}`,
    });
    await LeaveBalanceService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), leaveTypeId: leaveType._id.toString(), year: 2025, entitledDays: 15 },
      {},
    );
    await LeaveBalanceService.create(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), leaveTypeId: leaveType._id.toString(), year: 2026, entitledDays: 15 },
      {},
    );
    await LeaveBalanceService.create(
      { organizationId: organization._id.toString(), employeeId: otherEmployee._id.toString(), leaveTypeId: leaveType._id.toString(), year: 2026, entitledDays: 15 },
      {},
    );

    const balances = await LeaveBalanceService.listForEmployee(employee._id.toString(), organization._id.toString());
    expect(balances).toHaveLength(2);
    expect(balances.every((balance) => balance.employeeId.toString() === employee._id.toString())).toBe(true);
  });
});
