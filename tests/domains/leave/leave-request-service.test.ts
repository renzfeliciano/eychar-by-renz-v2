import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel, AuditLogModel, LeaveRequestModel } from "@/server/db/models";
import { applyTableQuery } from "@/lib/table-query";
import { formatPersonName } from "@/lib/person-name";
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

describe("LeaveRequestService listings for the Leave page and dashboard", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  async function seedRequests() {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-lr-list-${Date.now()}-${Math.random()}` });
    const organizationId = organization._id.toString();
    const makeEmployee = async (firstName: string, lastName: string) => {
      const person = await PersonModel.create({ organizationId, firstName, lastName });
      return EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${firstName}-${Math.random()}` });
    };
    const zoe = await makeEmployee("Zoe", "Abad");
    const ana = await makeEmployee("Ana", "Cruz");
    const ana2 = await makeEmployee("Ana", "Cruz");
    const vacation = await LeaveTypeService.create({ organizationId, name: "Vacation", code: `VAC-${Math.random()}` }, {});
    const sick = await LeaveTypeService.create({ organizationId, name: "Sick", code: `SICK-${Math.random()}` }, {});
    const now = new Date(Date.UTC(2026, 4, 15, 6));
    const d = (month: number, day: number) => new Date(Date.UTC(2026, month - 1, day));
    const rows: [typeof zoe, typeof vacation, Date, Date, string, number][] = [
      [zoe, vacation, d(5, 14), d(5, 16), "approved", 3],
      [ana, sick, d(5, 15), d(5, 15), "approved", 1],
      [ana, vacation, d(5, 15), d(5, 15), "approved", 1],
      [ana2, vacation, d(5, 20), d(5, 22), "approved", 3],
      [ana2, sick, d(6, 20), d(6, 21), "approved", 2],
      [zoe, sick, d(5, 1), d(5, 2), "pending", 2],
      [ana, vacation, d(4, 1), d(4, 3), "pending", 3],
      [zoe, vacation, d(3, 1), d(3, 1), "rejected", 1],
      [ana2, vacation, d(5, 15), d(5, 15), "cancelled", 1],
      [zoe, vacation, d(5, 16), d(5, 16), "approved", 1],
    ];
    await LeaveRequestModel.insertMany(
      rows.map(([employee, leaveType, startDate, endDate, status, totalDays]) => ({ organizationId, employeeId: employee._id, leaveTypeId: leaveType._id, startDate, endDate, status, totalDays })),
    );
    return { organizationId, now, employees: [zoe, ana, ana2], leaveTypes: [vacation, sick] };
  }

  it("pages, filters and sorts in the database exactly as the in-memory table did", async () => {
    const { organizationId, employees, leaveTypes } = await seedRequests();
    const people = await PersonModel.find({ _id: { $in: employees.map((employee) => employee.personId) } }).lean();
    const nameByEmployee = new Map(employees.map((employee) => [employee._id.toString(), formatPersonName(people.find((person) => person._id.equals(employee.personId)))]));
    const typeName = new Map(leaveTypes.map((leaveType) => [leaveType._id.toString(), leaveType.name]));
    const all = await LeaveRequestService.listForOrganization(organizationId);
    const ids = employees.map((employee) => employee._id.toString());
    const names = [...new Set([...ids.map((id) => nameByEmployee.get(id)!), "—"])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const rank = new Map(names.map((name, index) => [name, index]));

    for (const sort of ["startDate", "employee", "days", "status"]) {
      for (const dir of ["asc", "desc"] as const) {
        for (const status of [undefined, "approved"]) {
          for (const q of [undefined, "ana", "sick"]) {
            for (const page of [1, 2]) {
              const tableQuery = { q, sort, dir, page, pageSize: 3 };
              const visible = status ? all.filter((request) => request.status === status) : all;
              const expected = applyTableQuery(visible, tableQuery, {
                searchFields: (request) => [nameByEmployee.get(request.employeeId.toString()) ?? "—", typeName.get(request.leaveTypeId.toString())],
                sortValues: {
                  employee: (request) => nameByEmployee.get(request.employeeId.toString()) ?? "—",
                  startDate: (request) => new Date(request.startDate),
                  days: (request) => request.totalDays,
                  status: (request) => request.status,
                },
              });
              const actual = await LeaveRequestService.page(organizationId, {
                ...tableQuery,
                status,
                employeeIdsMatchingQ: q ? ids.filter((id) => nameByEmployee.get(id)!.toLowerCase().includes(q)) : undefined,
                leaveTypeIdsMatchingQ: q ? leaveTypes.filter((leaveType) => leaveType.name.toLowerCase().includes(q)).map((leaveType) => leaveType._id.toString()) : undefined,
                employeeOrder: sort === "employee" ? { ids, ranks: ids.map((id) => rank.get(nameByEmployee.get(id)!)!), missingRank: rank.get("—")! } : undefined,
              });
              const label = JSON.stringify(tableQuery) + status;
              expect(actual.total, label).toBe(expected.total);
              // Ties (same sort value) may come back in either order; compare the sort keys and the set per page.
              const key = (request: { employeeId: unknown; startDate: Date; totalDays: number; status: string }) =>
                sort === "employee" ? nameByEmployee.get(String(request.employeeId)) : sort === "days" ? request.totalDays : sort === "status" ? request.status : new Date(request.startDate).getTime();
              expect(actual.rows.map(key), label).toEqual(expected.rows.map(key));
            }
          }
        }
      }
    }
  });

  it("counts the summary strip, pending requests and who's on leave on a day without loading every request", async () => {
    const { organizationId, now } = await seedRequests();
    const all = await LeaveRequestService.listForOrganization(organizationId);
    const todayKey = now.toISOString().slice(0, 10);
    const covers = (request: (typeof all)[number], key: string) => new Date(request.startDate).toISOString().slice(0, 10) <= key && new Date(request.endDate).toISOString().slice(0, 10) >= key;
    const approved = all.filter((request) => request.status === "approved");

    const summary = await LeaveRequestService.summary(organizationId, now);
    expect(summary.total).toBe(all.length);
    for (const status of ["pending", "approved", "rejected", "cancelled"]) {
      expect(summary.byStatus.get(status)?.count ?? 0).toBe(all.filter((request) => request.status === status).length);
    }
    expect(summary.onLeaveToday).toBe(new Set(approved.filter((request) => covers(request, todayKey)).map((request) => request.employeeId.toString())).size);
    expect(summary.onLeaveToday).toBe(2);
    expect(summary.upcoming).toBe(approved.filter((request) => new Date(request.startDate).getTime() > now.getTime() && new Date(request.startDate).getTime() - now.getTime() <= 30 * 86_400_000).length);
    expect(summary.upcoming).toBe(2);
    expect(summary.approvedDaysThisMonth).toBe(approved.filter((request) => new Date(request.startDate).toISOString().startsWith("2026-05")).reduce((sum, request) => sum + request.totalDays, 0));

    expect(await LeaveRequestService.countPending(organizationId)).toBe(2);
    const covering = await LeaveRequestService.listCoveringDate(organizationId, todayKey);
    expect(covering.map((request) => request._id.toString()).sort()).toEqual(approved.filter((request) => covers(request, todayKey)).map((request) => request._id.toString()).sort());
    expect(await LeaveRequestService.listCoveringDate(organizationId, "2026-05-17")).toHaveLength(0);

    // Days per status.
    for (const status of ["pending", "approved", "rejected", "cancelled"]) {
      const matching = all.filter((request) => request.status === status);
      expect(summary.byStatus.get(status)?.days ?? 0).toBe(matching.reduce((sum, request) => sum + request.totalDays, 0));
    }
  });
});
