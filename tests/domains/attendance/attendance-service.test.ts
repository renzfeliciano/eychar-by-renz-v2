import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel, AuditLogModel } from "@/server/db/models";
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
function atLocalTime(date: Date, hours: number, minutes: number): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes);
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
