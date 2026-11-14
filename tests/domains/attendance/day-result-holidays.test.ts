import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { zonedInstant } from "@/lib/app-time";
import { connectMongoDB } from "@/server/db/connection";
import {
  AttendancePolicyModel,
  AttendanceRecordModel,
  EmployeeModel,
  HolidayModel,
  LeaveRequestModel,
  LocationModel,
  OrganizationModel,
  PayrollPolicyModel,
  PersonModel,
  ProjectModel,
} from "@/server/db/models";
import { AttendanceService } from "@/domains/attendance/attendance-service";
import { buildDayResult, DayResultService } from "@/domains/attendance/day-result";
import { previousWorkdayStatus } from "@/domains/attendance/day-holiday";

// Plan Phase 4: the holiday calendar drives the stored day type, mapped
// through the payroll policy (pay treatment), never a hardcoded switch.
const FRIDAY = "2026-10-02";
const MONDAY = "2026-10-05";
const TUESDAY = "2026-10-06";
const SATURDAY = "2026-10-10";
const day = (key: string) => new Date(`${key}T00:00:00.000Z`);
const at = (key: string, time: string) => zonedInstant(key, time);

async function seed(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-hol-${suffix}-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  const person = await PersonModel.create({ organizationId, firstName: "Jo", lastName: "Cruz" });
  const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${suffix}-${Math.random()}` });
  await AttendancePolicyModel.create({
    organizationId,
    name: "Standard",
    standardStartTime: "09:00",
    standardEndTime: "18:00",
    gracePeriodMinutes: 0,
    workDays: [1, 2, 3, 4, 5],
    effectiveFrom: day("2026-01-01"),
  });
  return { organizationId, employeeId: employee._id.toString() };
}

function holiday(organizationId: string, date: string, type: string, extra: Record<string, unknown> = {}) {
  return HolidayModel.create({ organizationId, date: day(date), name: `Holiday ${type} ${Math.random()}`, type, ...extra });
}

function payrollPolicy(organizationId: string, extra: Record<string, unknown> = {}) {
  return PayrollPolicyModel.create({ organizationId, name: "Pay", payFrequency: "semi-monthly", effectiveFrom: day("2026-01-01"), ...extra });
}

async function projectAt(organizationId: string, locationName: string) {
  const location = await LocationModel.create({ organizationId, name: locationName, code: `LOC-${Math.random()}` });
  const project = await ProjectModel.create({ organizationId, name: `Site ${locationName}`, code: `P-${Math.random()}`, locationId: location._id });
  return project._id.toString();
}

const workedDay = (organizationId: string, employeeId: string, date: string, checkIn = "09:30") =>
  AttendanceService.record({ organizationId, employeeId, date: day(date), checkInAt: at(date, checkIn), checkOutAt: at(date, "18:00") }, {});

describe("holidays drive the stored day type (plan Phase 4)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("an active regular holiday makes a worked weekday a regular holiday with no late or scheduled hours", async () => {
    const { organizationId, employeeId } = await seed("reg");
    const entry = await holiday(organizationId, MONDAY, "regular");

    const record = await workedDay(organizationId, employeeId, MONDAY);

    expect(record.dayResult).toMatchObject({ dayType: "regular_holiday", restDay: false, scheduledMinutes: 0, lateMinutes: 0, workedMinutes: 510 });
    expect(record.dayResult?.holidayId?.toString()).toBe(entry._id.toString());
  });

  it("ignores a cancelled holiday", async () => {
    const { organizationId, employeeId } = await seed("cancel");
    await holiday(organizationId, MONDAY, "regular", { status: "cancelled" });

    const record = await workedDay(organizationId, employeeId, MONDAY);

    expect(record.dayResult?.dayType).toBe("workday");
    expect(record.dayResult?.holidayId).toBeUndefined();
  });

  it("a special working day stays an ordinary day: late still counts", async () => {
    const { organizationId, employeeId } = await seed("sw");
    await holiday(organizationId, MONDAY, "special_working");

    const record = await workedDay(organizationId, employeeId, MONDAY);

    expect(record.dayResult).toMatchObject({ dayType: "special_working", lateMinutes: 30, scheduledMinutes: 540 });
  });

  it("uses the default mapping when the payroll policy predates it, and the policy's mapping when set", async () => {
    const { organizationId, employeeId } = await seed("map");
    await holiday(organizationId, MONDAY, "special_non_working");
    await holiday(organizationId, TUESDAY, "regular");
    await payrollPolicy(organizationId, { holidayDayTypes: { regular: "workday" } });

    const special = await workedDay(organizationId, employeeId, MONDAY);
    const notObserved = await workedDay(organizationId, employeeId, TUESDAY);

    expect(special.dayResult?.dayType).toBe("special_holiday");
    expect(notObserved.dayResult).toMatchObject({ dayType: "workday", lateMinutes: 30 });
    expect(notObserved.dayResult?.holidayId).toBeUndefined();
  });

  it("can map a type to another day type", async () => {
    const { organizationId, employeeId } = await seed("remap");
    await holiday(organizationId, MONDAY, "special_non_working");
    await payrollPolicy(organizationId, { holidayDayTypes: { special_non_working: "regular_holiday" } });

    const record = await workedDay(organizationId, employeeId, MONDAY);

    expect(record.dayResult?.dayType).toBe("regular_holiday");
  });

  it("a holiday on a rest day keeps both facts", async () => {
    const { organizationId, employeeId } = await seed("rest");
    await holiday(organizationId, SATURDAY, "regular");

    const record = await workedDay(organizationId, employeeId, SATURDAY);

    expect(record.dayResult).toMatchObject({ dayType: "regular_holiday", restDay: true });
  });

  it("a local holiday applies only where the employee's project is located", async () => {
    const { organizationId, employeeId } = await seed("scope");
    await holiday(organizationId, MONDAY, "special_non_working", { scope: "Cebu City" });
    const cebu = await projectAt(organizationId, "cebu city");
    const manila = await projectAt(organizationId, "Manila");
    const source = { organizationId, employeeId, date: day(MONDAY), checkInAt: at(MONDAY, "09:00"), checkOutAt: at(MONDAY, "18:00") };

    expect((await buildDayResult({ ...source, projectId: cebu })).dayType).toBe("special_holiday");
    expect((await buildDayResult({ ...source, projectId: manila })).dayType).toBe("workday");
    expect((await buildDayResult(source)).dayType).toBe("workday");
  });

  it("two holidays on one day: the one with the stronger day type wins", async () => {
    const { organizationId, employeeId } = await seed("two");
    await holiday(organizationId, MONDAY, "special_working");
    const regular = await holiday(organizationId, MONDAY, "regular");

    const record = await workedDay(organizationId, employeeId, MONDAY);

    expect(record.dayResult?.holidayId?.toString()).toBe(regular._id.toString());
  });

  it("records whether the employee attended the previous workday", async () => {
    const { organizationId, employeeId } = await seed("prev");
    await holiday(organizationId, TUESDAY, "regular");
    await workedDay(organizationId, employeeId, MONDAY);

    const record = await workedDay(organizationId, employeeId, TUESDAY);

    expect(record.dayResult?.previousWorkday).toMatchObject({ date: day(MONDAY), attended: true, onLeave: false });
  });

  it("the previous workday skips rest days and day-off holidays, and notices approved leave", async () => {
    const { organizationId, employeeId } = await seed("leave");
    await holiday(organizationId, MONDAY, "regular");
    await holiday(organizationId, FRIDAY, "special_working");
    await LeaveRequestModel.create({ organizationId, employeeId, leaveTypeId: new Types.ObjectId(), startDate: day(FRIDAY), endDate: day(FRIDAY), totalDays: 1, status: "approved" });

    // No attendance on the holiday itself: payroll asks for unworked holidays too.
    const status = await previousWorkdayStatus({ organizationId, employeeId, date: MONDAY });

    expect(status).toEqual({ date: day(FRIDAY), attended: false, onLeave: true });
  });

  it("an ordinary day stores no previous-workday fact", async () => {
    const { organizationId, employeeId } = await seed("plain");
    const record = await workedDay(organizationId, employeeId, MONDAY);
    expect(record.dayResult?.previousWorkday).toBeUndefined();
  });

  it("recalculate picks up a holiday added after the day was recorded", async () => {
    const { organizationId, employeeId } = await seed("late-add");
    const record = await workedDay(organizationId, employeeId, MONDAY);
    expect(record.dayResult?.dayType).toBe("workday");
    await holiday(organizationId, MONDAY, "regular");

    const report = await DayResultService.recalculate({ organizationId, from: MONDAY, to: MONDAY }, {});

    expect(report).toEqual({ scanned: 1, changed: 1 });
    const saved = await AttendanceRecordModel.findById(record._id).lean<{ dayResult: { dayType: string } }>();
    expect(saved?.dayResult.dayType).toBe("regular_holiday");
  });
});
