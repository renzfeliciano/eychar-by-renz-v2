import { describe, it, expect, beforeEach } from "vitest";
import { zonedInstant } from "@/lib/app-time";
import { connectMongoDB } from "@/server/db/connection";
import { Types } from "mongoose";
import { OrganizationModel, PersonModel, EmployeeModel, AuditLogModel, AttendanceRecordModel, EmployeeAssignmentModel, EmploymentModel, ProjectModel } from "@/server/db/models";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";
import { AttendanceService } from "@/domains/attendance/attendance-service";
import { AttendancePolicyService } from "@/domains/attendance/attendance-policy-service";
import { AttendanceStatusService } from "@/domains/catalog/attendance-status-service";
import { ConflictError, BusinessRuleError } from "@/shared/errors";

async function seedEmployeeWithPolicy(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-att-${suffix}-${Date.now()}-${Math.random()}` });
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
  const employee = await EmployeeModel.create({
    organizationId: organization._id,
    personId: person._id,
    employeeNumber: `EMP-${suffix}-${Date.now()}-${Math.random()}`,
  });
  const policy = await AttendancePolicyService.create(
    {
      organizationId: organization._id.toString(),
      name: "Standard",
      standardStartTime: "09:00",
      standardEndTime: "18:00",
      gracePeriodMinutes: 10,
    },
    {},
  );
  return { organization, employee, policy };
}

// Fixed calendar dates would eventually fall before an AttendancePolicy's
// default effectiveFrom (`new Date()` at creation time), making resolve()
// correctly find nothing — always attend "today" relative to whenever the
// suite actually runs.
function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** A wall-clock check-in time in the *local* timezone the test runner is in
 * — the timezone an organization's policy.standardStartTime ("09:00") is
 * actually meant to be read in. */
// A wall-clock time in the organization's zone (Asia/Manila), whatever timezone the test machine runs in.
function atLocalTime(date: Date, hours: number, minutes: number): Date {
  return zonedInstant(date.toISOString().slice(0, 10), `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);
}

describe("AttendanceService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("records present when check-in is within the grace period (organization-local wall-clock time)", async () => {
    const { organization, employee } = await seedEmployeeWithPolicy("1");
    const date = todayUtc();
    const checkInAt = atLocalTime(date, 9, 5);

    const record = await AttendanceService.record(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), date, checkInAt },
      {},
    );

    expect(record.status).toBe("present");
  });

  it("records late when check-in is after the grace period (organization-local wall-clock time)", async () => {
    const { organization, employee } = await seedEmployeeWithPolicy("2");
    const date = todayUtc();
    const checkInAt = atLocalTime(date, 9, 25);

    const record = await AttendanceService.record(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), date, checkInAt },
      {},
    );

    expect(record.status).toBe("late");
  });

  it("treats an early-morning local check-in as present, even though it falls on the previous UTC calendar day", async () => {
    // A real bug this reproduces: comparing check-in time in UTC against a
    // policy.standardStartTime meant in the organization's own local time
    // silently shifts every comparison by the local UTC offset. Someone
    // clocking in at 6am local — clearly on time against a 9am policy — must
    // never be marked "late" just because 6am local can land on the *previous*
    // UTC calendar day for timezones ahead of UTC.
    const { organization, employee } = await seedEmployeeWithPolicy("7");
    const date = todayUtc();
    const checkInAt = atLocalTime(date, 6, 0);

    const record = await AttendanceService.record(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), date, checkInAt },
      {},
    );

    expect(record.status).toBe("present");
  });

  it("uses an explicit status instead of computing one from check-in time", async () => {
    const { organization, employee } = await seedEmployeeWithPolicy("3");
    const date = todayUtc();

    const record = await AttendanceService.record(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), date, status: "on_leave" },
      {},
    );

    expect(record.status).toBe("on_leave");
  });

  it("rejects a second record for the same employee and date", async () => {
    const { organization, employee } = await seedEmployeeWithPolicy("4");
    const date = todayUtc();
    await AttendanceService.record(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), date, status: "present" },
      {},
    );

    await expect(
      AttendanceService.record(
        { organizationId: organization._id.toString(), employeeId: employee._id.toString(), date, status: "absent" },
        {},
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("adjusts a record and writes an audit entry with before/after", async () => {
    const { organization, employee } = await seedEmployeeWithPolicy("5");
    const date = todayUtc();
    const record = await AttendanceService.record(
      { organizationId: organization._id.toString(), employeeId: employee._id.toString(), date, status: "absent" },
      {},
    );

    const adjusted = await AttendanceService.adjust(
      record._id.toString(),
      organization._id.toString(),
      { status: "present", notes: "Forgot to log; confirmed with supervisor" },
      {},
    );

    expect(adjusted.status).toBe("present");
    const audits = await AuditLogModel.find({ resourceId: record._id, action: "attendance.adjusted" }).lean();
    expect(audits).toHaveLength(1);
    expect(audits[0].before).toMatchObject({ status: "absent" });
    expect(audits[0].after).toMatchObject({ status: "present" });
  });

  it("leaves clock photos out of list results (roster/dashboard never render them)", async () => {
    const { organization, employee } = await seedEmployeeWithPolicy("8");
    const date = todayUtc();
    await AttendanceRecordModel.create({
      organizationId: organization._id,
      employeeId: employee._id,
      date,
      status: "present",
      checkIn: { at: new Date(), photo: "data:image/jpeg;base64,/9j/4AAQ", latitude: 14.5 },
    });

    const [fromOrganization] = await AttendanceService.listForOrganization(organization._id.toString(), { date });
    const [fromEmployee] = await AttendanceService.listForEmployee(employee._id.toString(), organization._id.toString());

    expect(fromOrganization.checkIn?.photo).toBeUndefined();
    expect(fromOrganization.checkIn?.latitude).toBe(14.5);
    expect(fromEmployee.checkIn?.photo).toBeUndefined();
  });

  it("rejects a status that doesn't match the organization's configured attendance-status catalog", async () => {
    const { organization, employee } = await seedEmployeeWithPolicy("6");
    await AttendanceStatusService.create(
      { organizationId: organization._id.toString(), code: "present", name: "Present" },
      {},
    );

    await expect(
      AttendanceService.record(
        { organizationId: organization._id.toString(), employeeId: employee._id.toString(), date: todayUtc(), status: "made-up" },
        {},
      ),
    ).rejects.toThrow(BusinessRuleError);
  });
});

describe("AttendanceService.listForOrganization project filter", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("resolves each record's project as of its own date with one batched lookup, matching getAsOf per record", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-att-proj-${Date.now()}-${Math.random()}` });
    const projectA = await ProjectModel.create({ organizationId: organization._id, name: "Site A", code: `A-${Math.random()}` });
    const projectB = await ProjectModel.create({ organizationId: organization._id, name: "Site B", code: `B-${Math.random()}` });
    const makeEmployee = async (n: string) => {
      const person = await PersonModel.create({ organizationId: organization._id, firstName: n, lastName: "Doe" });
      return EmployeeModel.create({ organizationId: organization._id, personId: person._id, employeeNumber: `EMP-${n}-${Math.random()}` });
    };
    const mover = await makeEmployee("Mover");
    const stayer = await makeEmployee("Stayer");
    const unassigned = await makeEmployee("Unassigned");

    const day = (d: number) => new Date(Date.UTC(2026, 0, d));
    // Mover: Site A from Jan 1, transferred to Site B on Jan 10 (close/open share the instant).
    await EmployeeAssignmentModel.create({ organizationId: organization._id, employeeId: mover._id, projectId: projectA._id, effectiveFrom: day(1), effectiveTo: day(10) });
    await EmployeeAssignmentModel.create({ organizationId: organization._id, employeeId: mover._id, projectId: projectB._id, effectiveFrom: day(10) });
    await EmployeeAssignmentModel.create({ organizationId: organization._id, employeeId: stayer._id, projectId: projectA._id, effectiveFrom: day(1) });

    for (const employee of [mover, stayer, unassigned]) {
      for (const d of [5, 10, 15]) {
        await AttendanceRecordModel.create({ organizationId: organization._id, employeeId: employee._id, date: day(d), status: "present" });
      }
    }

    const organizationId = organization._id.toString();
    const key = (record: { employeeId: unknown; date: Date }) => `${String(record.employeeId)}@${record.date.toISOString().slice(0, 10)}`;
    const atA = (await AttendanceService.listForOrganization(organizationId, { projectId: projectA._id.toString() })).map(key).sort();
    const atB = (await AttendanceService.listForOrganization(organizationId, { projectId: projectB._id.toString() })).map(key).sort();

    // The previous per-record implementation, as the reference.
    const all = await AttendanceService.listForOrganization(organizationId);
    const reference = async (projectId: string) => {
      const out = [];
      for (const record of all) {
        const assignment = await EmployeeAssignmentService.getAsOf(record.employeeId.toString(), record.date);
        if (assignment?.projectId?.toString() === projectId) out.push(key(record));
      }
      return out.sort();
    };
    expect(atA).toEqual(await reference(projectA._id.toString()));
    expect(atB).toEqual(await reference(projectB._id.toString()));

    const m = mover._id.toString();
    const s = stayer._id.toString();
    expect(atA).toEqual([`${m}@2026-01-05`, `${m}@2026-01-10`, `${s}@2026-01-05`, `${s}@2026-01-10`, `${s}@2026-01-15`].sort());
    expect(atB).toEqual([`${m}@2026-01-15`]);
  });
});

describe("AttendanceService.dayRoster", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("pages current staff plus anyone with a record that day, and counts the whole day", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-att-day-${Date.now()}-${Math.random()}` });
    const organizationId = organization._id.toString();
    await EmploymentStatusService.create({ organizationId, code: "active", name: "Active", metadata: { isActiveHeadcount: true } }, {});
    await EmploymentStatusService.create({ organizationId, code: "resigned", name: "Resigned", metadata: { isActiveHeadcount: false } }, {});
    const project = await ProjectModel.create({ organizationId, name: "Site A", code: `A-${Math.random()}` });
    const day = new Date(Date.UTC(2026, 2, 3));
    const make = async (name: string, status: string, recordStatus?: string) => {
      const person = await PersonModel.create({ organizationId, firstName: name, lastName: "Doe" });
      const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${name}-${Math.random()}` });
      await EmploymentModel.create({ organizationId, employeeId: employee._id, employmentType: "regular", status, effectiveFrom: new Date(Date.UTC(2025, 0, 1)) });
      await EmployeeAssignmentModel.create({ organizationId, employeeId: employee._id, projectId: project._id, effectiveFrom: new Date(Date.UTC(2025, 0, 1)) });
      if (recordStatus) {
        await AttendanceRecordModel.create({ organizationId, employeeId: employee._id, date: day, status: recordStatus, checkIn: { at: day, photo: "data:image/jpeg;base64,xx", distanceMeters: 12 } });
      }
      return employee._id.toString();
    };
    const present = await make("Present", "active", "present");
    const missing = await make("Missing", "active");
    const separated = await make("Separated", "resigned", "late");
    await make("Gone", "resigned");
    // Another day's record doesn't count.
    await AttendanceRecordModel.create({ organizationId, employeeId: new Types.ObjectId(missing), date: new Date(Date.UTC(2026, 2, 4)), status: "absent" });

    const first = await AttendanceService.dayRoster(organizationId, new Date(Date.UTC(2026, 2, 3, 15)), { page: 1, pageSize: 2 });
    expect(first.total).toBe(3);
    expect(first.notRecorded).toBe(1);
    expect(Object.fromEntries(first.countByStatus)).toEqual({ present: 1, late: 1 });
    expect(first.rows.map((row) => row._id.toString())).toEqual([present, missing]);
    expect(first.rows[0]).toMatchObject({ person: { firstName: "Present", lastName: "Doe" }, record: { status: "present", checkIn: { distanceMeters: 12 } } });
    expect((first.rows[0].record?.checkIn as { photo?: string }).photo).toBeUndefined();
    expect(first.rows[0].currentAssignment?.projectId?.toString()).toBe(project._id.toString());
    expect(first.rows[1].record).toBeUndefined();

    const second = await AttendanceService.dayRoster(organizationId, day, { page: 2, pageSize: 2 });
    expect(second.rows.map((row) => row._id.toString())).toEqual([separated]);
    expect(second.total).toBe(3);
  });
});
