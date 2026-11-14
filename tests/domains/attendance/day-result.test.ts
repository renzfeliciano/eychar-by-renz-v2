import { describe, it, expect, beforeEach } from "vitest";
import { Types } from "mongoose";
import { zonedInstant } from "@/lib/app-time";
import { connectMongoDB } from "@/server/db/connection";
import {
  AttendancePolicyModel,
  AttendanceRecordModel,
  AuditLogModel,
  EmployeeModel,
  OrganizationModel,
  PayrollPolicyModel,
  PersonModel,
  ScheduleEntryModel,
} from "@/server/db/models";
import { AttendanceService } from "@/domains/attendance/attendance-service";
import { DayResultService } from "@/domains/attendance/day-result";
import { backfillDayResults } from "@/domains/attendance/day-result-backfill";
import { DAY_CALC_VERSION } from "@/domains/attendance/day-calc";
import { BusinessRuleError } from "@/shared/errors";

const MONDAY = "2026-10-05";
const SATURDAY = "2026-10-10";
const day = (key: string) => new Date(`${key}T00:00:00.000Z`);
const at = (key: string, time: string) => zonedInstant(key, time);

async function seed(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-dr-${suffix}-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  const person = await PersonModel.create({ organizationId, firstName: "Jo", lastName: "Cruz" });
  const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${suffix}-${Math.random()}` });
  const policy = await AttendancePolicyModel.create({
    organizationId,
    name: "Standard",
    standardStartTime: "09:00",
    standardEndTime: "18:00",
    gracePeriodMinutes: 0,
    workDays: [1, 2, 3, 4, 5],
    effectiveFrom: day("2026-01-01"),
  });
  return { organizationId, employeeId: employee._id.toString(), policy };
}

async function scheduleShift(organizationId: string, employeeId: string, date: string, shift: Record<string, unknown>) {
  return ScheduleEntryModel.create({
    organizationId,
    employeeId,
    date: day(date),
    shiftTemplateId: new Types.ObjectId(),
    shift: { code: "X", name: "Shift", kind: "work", pattern: "fixed", ...shift },
  });
}

describe("stored day result (plan Phase 3)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("record() stores the day result with the policy used and the calculation version", async () => {
    const { organizationId, employeeId, policy } = await seed("rec");
    const record = await AttendanceService.record({ organizationId, employeeId, date: day(MONDAY), checkInAt: at(MONDAY, "09:30"), checkOutAt: at(MONDAY, "19:00") }, {});

    expect(record.dayResult).toMatchObject({
      scheduledMinutes: 540,
      workedMinutes: 570,
      lateMinutes: 30,
      overtimeMinutes: 60,
      dayType: "workday",
      restDay: false,
      flags: ["overtime_unapproved"],
      calcVersion: DAY_CALC_VERSION,
    });
    expect(record.dayResult?.policyId?.toString()).toBe(policy._id.toString());
    expect(record.dayResult?.calculatedAt).toBeInstanceOf(Date);
  });

  it("measures against the scheduled shift, overnight included", async () => {
    const { organizationId, employeeId } = await seed("night");
    const entry = await scheduleShift(organizationId, employeeId, MONDAY, { startTime: "22:00", endTime: "07:00", breakMinutes: 60 });

    const record = await AttendanceService.record({ organizationId, employeeId, date: day(MONDAY), checkInAt: at(MONDAY, "22:00"), checkOutAt: at("2026-10-06", "07:00") }, {});

    expect(record.dayResult).toMatchObject({ scheduledMinutes: 480, workedMinutes: 480, nightDiffMinutes: 480, lateMinutes: 0, flags: ["crosses_midnight"] });
    expect(record.dayResult?.scheduleEntryId?.toString()).toBe(entry._id.toString());
  });

  it("a day outside the policy's work week is a rest day; a scheduled rest day is one too", async () => {
    const { organizationId, employeeId } = await seed("rest");
    const saturday = await AttendanceService.record({ organizationId, employeeId, date: day(SATURDAY), checkInAt: at(SATURDAY, "09:00"), checkOutAt: at(SATURDAY, "13:00") }, {});
    expect(saturday.dayResult).toMatchObject({ dayType: "rest_day", restDay: true, lateMinutes: 0 });

    await ScheduleEntryModel.create({ organizationId, employeeId, date: day(MONDAY), shiftTemplateId: new Types.ObjectId(), shift: { code: "RD", name: "Rest", kind: "rest" } });
    const monday = await AttendanceService.record({ organizationId, employeeId, date: day(MONDAY), checkInAt: at(MONDAY, "09:00"), checkOutAt: at(MONDAY, "13:00") }, {});
    expect(monday.dayResult).toMatchObject({ dayType: "rest_day", restDay: true });
  });

  it("caps regular time at the payroll policy's daily hours", async () => {
    const { organizationId, employeeId } = await seed("cap");
    const payrollPolicy = await PayrollPolicyModel.create({ organizationId, name: "Pay", payFrequency: "semi-monthly", hoursPerDay: 8, effectiveFrom: day("2026-01-01") });
    await scheduleShift(organizationId, employeeId, MONDAY, { startTime: "07:00", endTime: "17:00" });

    const record = await AttendanceService.record({ organizationId, employeeId, date: day(MONDAY), checkInAt: at(MONDAY, "07:00"), checkOutAt: at(MONDAY, "17:00") }, {});

    expect(record.dayResult).toMatchObject({ scheduledMinutes: 600, overtimeMinutes: 120, regularMinutesCap: 480 });
    expect(record.dayResult?.payrollPolicyId?.toString()).toBe(payrollPolicy._id.toString());
  });

  it("adjust() recomputes the day; approving overtime records who and when and clears the flag", async () => {
    const { organizationId, employeeId } = await seed("adj");
    const userId = new Types.ObjectId().toString();
    const record = await AttendanceService.record({ organizationId, employeeId, date: day(MONDAY), checkInAt: at(MONDAY, "09:00"), checkOutAt: at(MONDAY, "18:00") }, {});
    expect(record.dayResult?.overtimeMinutes).toBe(0);

    const later = await AttendanceService.adjust(record._id.toString(), organizationId, { checkOutAt: at(MONDAY, "20:00") }, { userId });
    expect(later.dayResult).toMatchObject({ overtimeMinutes: 120, flags: ["overtime_unapproved"] });

    const approved = await AttendanceService.adjust(record._id.toString(), organizationId, { overtimeApproved: true }, { userId });
    expect(approved.dayResult?.flags).toEqual([]);
    expect(approved.overtimeApproved).toBe(true);
    expect(approved.overtimeApprovedBy?.toString()).toBe(userId);
    expect(approved.overtimeApprovedAt).toBeInstanceOf(Date);
    const audits = await AuditLogModel.find({ resourceId: record._id, action: "attendance.adjusted" }).sort({ _id: 1 }).lean();
    expect(audits).toHaveLength(2);
    expect(audits[1].before).toMatchObject({ overtimeApproved: false });
    expect(audits[1].after).toMatchObject({ overtimeApproved: true, dayResult: { flags: [] } });
  });
});

describe("DayResultService.recalculate (plan Phase 3)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("rewrites only days whose result changed, auditing each with before/after", async () => {
    const { organizationId, employeeId } = await seed("recalc");
    const changed = await AttendanceService.record({ organizationId, employeeId, date: day(MONDAY), checkInAt: at(MONDAY, "06:00"), checkOutAt: at(MONDAY, "15:00") }, {});
    const unchanged = await AttendanceService.record({ organizationId, employeeId, date: day("2026-10-06"), checkInAt: at("2026-10-06", "09:00"), checkOutAt: at("2026-10-06", "18:00") }, {});
    expect(changed.dayResult?.lateMinutes).toBe(0);
    expect(changed.dayResult?.undertimeMinutes).toBe(180);

    // HR schedules the early shift after the fact.
    await scheduleShift(organizationId, employeeId, MONDAY, { startTime: "06:00", endTime: "15:00" });
    const userId = new Types.ObjectId().toString();
    const result = await DayResultService.recalculate({ organizationId, from: MONDAY, to: "2026-10-06" }, { userId });

    expect(result).toEqual({ scanned: 2, changed: 1 });
    const after = await AttendanceRecordModel.findById(changed._id).lean();
    expect(after?.dayResult?.undertimeMinutes).toBe(0);
    const audits = await AuditLogModel.find({ action: "attendance.recalculated", resourceId: changed._id }).lean();
    expect(audits).toHaveLength(1);
    expect(audits[0].before).toMatchObject({ undertimeMinutes: 180 });
    expect(audits[0].after).toMatchObject({ undertimeMinutes: 0 });
    expect(audits[0].actorUserId?.toString()).toBe(userId);
    expect(await AuditLogModel.countDocuments({ action: "attendance.recalculated", resourceId: unchanged._id })).toBe(0);

    expect(await DayResultService.recalculate({ organizationId, from: MONDAY, to: "2026-10-06" }, { userId })).toEqual({ scanned: 2, changed: 0 });
  });

  it("can be limited to one employee, never reaches another organization, and refuses a long range", async () => {
    const a = await seed("scope-a");
    const b = await seed("scope-b");
    const other = await AttendanceService.record({ organizationId: b.organizationId, employeeId: b.employeeId, date: day(MONDAY), checkInAt: at(MONDAY, "06:00"), checkOutAt: at(MONDAY, "15:00") }, {});
    await scheduleShift(b.organizationId, b.employeeId, MONDAY, { startTime: "06:00", endTime: "15:00" });

    expect(await DayResultService.recalculate({ organizationId: a.organizationId, from: MONDAY, to: MONDAY }, {})).toEqual({ scanned: 0, changed: 0 });
    expect(await DayResultService.recalculate({ organizationId: b.organizationId, from: MONDAY, to: MONDAY, employeeId: a.employeeId }, {})).toEqual({ scanned: 0, changed: 0 });
    expect((await AttendanceRecordModel.findById(other._id).lean())?.dayResult?.undertimeMinutes).toBe(180);

    await expect(DayResultService.recalculate({ organizationId: a.organizationId, from: "2026-01-01", to: "2026-06-30" }, {})).rejects.toThrow(BusinessRuleError);
  });
});

describe("backfillDayResults (plan Phase 3)", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("fills only records without a result, from the policy stored on the record, dry run first, idempotent", async () => {
    const { organizationId, employeeId, policy } = await seed("bf");
    // The policy was later retired and replaced, even for that date. The old
    // record was judged against the stored one, and the backfill must keep it.
    await AttendancePolicyModel.updateOne({ _id: policy._id }, { status: "inactive" });
    await AttendancePolicyModel.create({ organizationId, name: "New", standardStartTime: "07:00", standardEndTime: "16:00", gracePeriodMinutes: 0, effectiveFrom: day("2026-01-01") });
    const old = await AttendanceRecordModel.create({ organizationId, employeeId, date: day(MONDAY), checkInAt: at(MONDAY, "09:30"), checkOutAt: at(MONDAY, "18:00"), status: "late", policyId: policy._id });
    const done = await AttendanceService.record({ organizationId, employeeId, date: day("2026-10-06"), checkInAt: at("2026-10-06", "09:00"), checkOutAt: at("2026-10-06", "18:00") }, {});
    const doneAt = done.dayResult?.calculatedAt;

    const dryRun = await backfillDayResults({ apply: false, organizationId });
    expect(dryRun).toMatchObject({ scanned: 1, filled: 0 });
    expect((await AttendanceRecordModel.findById(old._id).lean())?.dayResult).toBeUndefined();

    const applied = await backfillDayResults({ apply: true, organizationId });
    expect(applied).toMatchObject({ scanned: 1, filled: 1 });
    const filled = await AttendanceRecordModel.findById(old._id).lean();
    expect(filled?.dayResult).toMatchObject({ lateMinutes: 30, calcVersion: DAY_CALC_VERSION });
    expect(filled?.dayResult?.policyId?.toString()).toBe(policy._id.toString());
    expect((await AttendanceRecordModel.findById(done._id).lean())?.dayResult?.calculatedAt).toEqual(doneAt);

    expect(await backfillDayResults({ apply: true, organizationId })).toMatchObject({ scanned: 0, filled: 0 });
  });
});
