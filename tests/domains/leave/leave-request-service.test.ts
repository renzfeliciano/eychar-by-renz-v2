import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel, AuditLogModel } from "@/server/db/models";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { LeaveBalanceService } from "@/domains/leave/leave-balance-service";
import { LeaveRequestService } from "@/domains/leave/leave-request-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";

async function seedEmployeeWithBalance(suffix: string, entitledDays = 10) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-lr-${suffix}-${Date.now()}-${Math.random()}` });
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
  await LeaveBalanceService.create(
    {
      organizationId: organization._id.toString(),
      employeeId: employee._id.toString(),
      leaveTypeId: leaveType._id.toString(),
      year: 2026,
      entitledDays,
    },
    {},
  );
  return { organization, employee, leaveType };
}

describe("LeaveRequestService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates a pending request within the available balance", async () => {
    const { organization, employee, leaveType } = await seedEmployeeWithBalance("1");

    const request = await LeaveRequestService.create(
      {
        organizationId: organization._id.toString(),
        employeeId: employee._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        startDate: new Date("2026-02-02"),
        endDate: new Date("2026-02-04"),
      },
      {},
    );

    expect(request.status).toBe("pending");
    expect(request.totalDays).toBe(3);
  });

  it("rejects a request that exceeds the available balance", async () => {
    const { organization, employee, leaveType } = await seedEmployeeWithBalance("2", 2);

    await expect(
      LeaveRequestService.create(
        {
          organizationId: organization._id.toString(),
          employeeId: employee._id.toString(),
          leaveTypeId: leaveType._id.toString(),
          startDate: new Date("2026-02-02"),
          endDate: new Date("2026-02-04"),
        },
        {},
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("rejects a request that overlaps an existing pending request for the same employee", async () => {
    const { organization, employee, leaveType } = await seedEmployeeWithBalance("3");
    await LeaveRequestService.create(
      {
        organizationId: organization._id.toString(),
        employeeId: employee._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        startDate: new Date("2026-02-02"),
        endDate: new Date("2026-02-04"),
      },
      {},
    );

    await expect(
      LeaveRequestService.create(
        {
          organizationId: organization._id.toString(),
          employeeId: employee._id.toString(),
          leaveTypeId: leaveType._id.toString(),
          startDate: new Date("2026-02-03"),
          endDate: new Date("2026-02-05"),
        },
        {},
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("accepts a non-overlapping request for the same employee", async () => {
    const { organization, employee, leaveType } = await seedEmployeeWithBalance("4");
    await LeaveRequestService.create(
      {
        organizationId: organization._id.toString(),
        employeeId: employee._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        startDate: new Date("2026-02-02"),
        endDate: new Date("2026-02-03"),
      },
      {},
    );

    const second = await LeaveRequestService.create(
      {
        organizationId: organization._id.toString(),
        employeeId: employee._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        startDate: new Date("2026-02-10"),
        endDate: new Date("2026-02-11"),
      },
      {},
    );

    expect(second.status).toBe("pending");
  });

  it("approves a pending request and audits before/after", async () => {
    const { organization, employee, leaveType } = await seedEmployeeWithBalance("5");
    const request = await LeaveRequestService.create(
      {
        organizationId: organization._id.toString(),
        employeeId: employee._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        startDate: new Date("2026-02-02"),
        endDate: new Date("2026-02-03"),
      },
      {},
    );

    const approverId = new Types.ObjectId().toString();
    const decided = await LeaveRequestService.decide(
      request._id.toString(),
      organization._id.toString(),
      { decision: "approved" },
      { userId: approverId },
    );

    expect(decided.status).toBe("approved");
    expect(decided.approvedBy?.toString()).toBe(approverId);
    const audits = await AuditLogModel.find({ resourceId: request._id, action: "leave-request.approved" }).lean();
    expect(audits).toHaveLength(1);
    expect(audits[0].before).toMatchObject({ status: "pending" });
    expect(audits[0].after).toMatchObject({ status: "approved" });
  });

  it("rejects a request with a reason", async () => {
    const { organization, employee, leaveType } = await seedEmployeeWithBalance("6");
    const request = await LeaveRequestService.create(
      {
        organizationId: organization._id.toString(),
        employeeId: employee._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        startDate: new Date("2026-02-02"),
        endDate: new Date("2026-02-03"),
      },
      {},
    );

    const decided = await LeaveRequestService.decide(
      request._id.toString(),
      organization._id.toString(),
      { decision: "rejected", rejectionReason: "Insufficient coverage" },
      {},
    );

    expect(decided.status).toBe("rejected");
    expect(decided.rejectionReason).toBe("Insufficient coverage");
  });

  it("rejects deciding a request that is no longer pending", async () => {
    const { organization, employee, leaveType } = await seedEmployeeWithBalance("7");
    const request = await LeaveRequestService.create(
      {
        organizationId: organization._id.toString(),
        employeeId: employee._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        startDate: new Date("2026-02-02"),
        endDate: new Date("2026-02-03"),
      },
      {},
    );
    await LeaveRequestService.decide(request._id.toString(), organization._id.toString(), { decision: "approved" }, {});

    await expect(
      LeaveRequestService.decide(request._id.toString(), organization._id.toString(), { decision: "rejected" }, {}),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("cancels a pending request but not one already decided", async () => {
    const { organization, employee, leaveType } = await seedEmployeeWithBalance("8");
    const request = await LeaveRequestService.create(
      {
        organizationId: organization._id.toString(),
        employeeId: employee._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        startDate: new Date("2026-02-02"),
        endDate: new Date("2026-02-03"),
      },
      {},
    );

    const cancelled = await LeaveRequestService.cancel(request._id.toString(), organization._id.toString(), {});
    expect(cancelled.status).toBe("cancelled");

    await expect(
      LeaveRequestService.cancel(request._id.toString(), organization._id.toString(), {}),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("rejects deciding a request that belongs to a different organization", async () => {
    const { organization, employee, leaveType } = await seedEmployeeWithBalance("9");
    const otherOrg = await OrganizationModel.create({ name: "Other", slug: `other-lr-9-${Date.now()}` });
    const request = await LeaveRequestService.create(
      {
        organizationId: organization._id.toString(),
        employeeId: employee._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        startDate: new Date("2026-02-02"),
        endDate: new Date("2026-02-03"),
      },
      {},
    );

    await expect(
      LeaveRequestService.decide(request._id.toString(), otherOrg._id.toString(), { decision: "approved" }, {}),
    ).rejects.toThrow(NotFoundError);
  });
});
