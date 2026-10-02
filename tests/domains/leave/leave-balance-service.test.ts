import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import mongoose from "mongoose";
import { OrganizationModel, PersonModel, EmployeeModel, LeaveRequestModel, AuditLogModel, LeaveBalanceModel } from "@/server/db/models";
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

  it("summarizes a year's balances with used, pending and available days, in one pass", async () => {
    const { organization, employee, leaveType } = await seedOrgEmployeeAndType("6");
    const organizationId = organization._id.toString();
    const sick = await LeaveTypeService.create({ organizationId, name: "Sick", code: "SICK-6" }, {});
    const vacation = await LeaveBalanceService.create({ organizationId, employeeId: employee._id.toString(), leaveTypeId: leaveType._id.toString(), year: 2026, entitledDays: 15 }, {});
    await LeaveBalanceService.adjust(vacation._id.toString(), organizationId, { adjustmentDays: 1.5 }, {});
    await LeaveBalanceService.create({ organizationId, employeeId: employee._id.toString(), leaveTypeId: sick._id.toString(), year: 2026, hasNoFixedAmount: true }, {});
    const request = (leaveTypeId: unknown, startDate: string, totalDays: number, status: string) =>
      LeaveRequestModel.create({ organizationId, employeeId: employee._id, leaveTypeId, startDate: new Date(startDate), endDate: new Date(startDate), totalDays, status });
    await request(leaveType._id, "2026-02-01", 3, "approved");
    await request(leaveType._id, "2026-03-01", 2, "pending");
    await request(leaveType._id, "2025-12-01", 4, "approved"); // another year
    await request(sick._id, "2026-05-01", 1, "approved");

    const summary = await LeaveBalanceService.summarizeForYear(organizationId, 2026);

    expect(summary.find((row) => row.leaveTypeId === leaveType._id.toString())).toMatchObject({
      employeeId: employee._id.toString(),
      balanceId: vacation._id.toString(),
      entitledDays: 15,
      adjustmentDays: 1.5,
      usedDays: 3,
      pendingDays: 2,
      availableDays: 13.5,
      unlimited: false,
    });
    expect(summary.find((row) => row.leaveTypeId === sick._id.toString())).toMatchObject({ usedDays: 1, availableDays: null, unlimited: true });
  });

  it("grants a leave type to every current employee who doesn't have it for the year yet", async () => {
    const { organization, employee, leaveType } = await seedOrgEmployeeAndType("7");
    const organizationId = organization._id.toString();
    const second = await EmployeeModel.create({
      organizationId,
      personId: (await PersonModel.create({ organizationId, firstName: "Second", lastName: "Person" }))._id,
      employeeNumber: `EMP-7-B-${Math.random()}`,
    });
    await LeaveBalanceService.create({ organizationId, employeeId: employee._id.toString(), leaveTypeId: leaveType._id.toString(), year: 2026, entitledDays: 20 }, {});

    const result = await LeaveBalanceService.grantMissing({ organizationId, leaveTypeId: leaveType._id.toString(), year: 2026, entitledDays: 15 }, {});

    expect(result).toEqual({ granted: 1, alreadyHad: 1 });
    const summary = await LeaveBalanceService.summarizeForYear(organizationId, 2026);
    expect(summary.find((row) => row.employeeId === second._id.toString())?.entitledDays).toBe(15);
    expect(summary.find((row) => row.employeeId === employee._id.toString())?.entitledDays).toBe(20);
    const audits = await AuditLogModel.find({ organizationId, action: "leave-balance.granted-in-bulk" }).lean();
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata).toMatchObject({ granted: 1, year: 2026, entitledDays: 15 });
  });

  it("grants ~50 employees in one balance insert and one audit insert, with one audit entry per balance", async () => {
    const { organization, employee, leaveType } = await seedOrgEmployeeAndType("50");
    const organizationId = organization._id.toString();
    const people = await PersonModel.insertMany(Array.from({ length: 49 }, (_, i) => ({ organizationId, firstName: `P${i}`, lastName: "Bulk" })));
    await EmployeeModel.insertMany(people.map((person, i) => ({ organizationId, personId: person._id, employeeNumber: `EMP-50-${i}-${Math.random()}` })));
    await LeaveBalanceService.create({ organizationId, employeeId: employee._id.toString(), leaveTypeId: leaveType._id.toString(), year: 2027, entitledDays: 5 }, {});

    const writes: string[] = [];
    mongoose.set("debug", (collection: string, method: string) => {
      if (["insertOne", "insertMany", "updateOne", "save", "create"].includes(method)) writes.push(`${collection}.${method}`);
    });
    let result;
    try {
      result = await LeaveBalanceService.grantMissing({ organizationId, leaveTypeId: leaveType._id.toString(), year: 2027, entitledDays: 12 }, { userId: undefined });
    } finally {
      mongoose.set("debug", false);
    }

    expect(result).toEqual({ granted: 49, alreadyHad: 1 });
    expect(writes.filter((w) => w.startsWith("leavebalances."))).toEqual(["leavebalances.insertMany"]);
    expect(writes.filter((w) => w.startsWith("auditlogs."))).toEqual(["auditlogs.insertMany"]);

    const balances = await LeaveBalanceModel.find({ organizationId, leaveTypeId: leaveType._id, year: 2027 }).lean();
    expect(balances).toHaveLength(50);
    expect(balances.filter((balance) => balance.entitledDays === 12)).toHaveLength(49);
    const created = await AuditLogModel.find({ organizationId, action: "leave-balance.created", resourceId: { $in: balances.map((balance) => balance._id) } }).lean();
    // 49 from the bulk grant + 1 from the create() above.
    expect(created).toHaveLength(50);
    expect(created.every((entry) => (entry.after as { year: number }).year === 2027)).toBe(true);
    const bulk = await AuditLogModel.find({ organizationId, action: "leave-balance.granted-in-bulk" }).lean();
    expect(bulk).toHaveLength(1);
    expect(bulk[0].metadata).toMatchObject({ granted: 49, alreadyHad: 1, year: 2027, entitledDays: 12, unlimited: false });
  });
});
