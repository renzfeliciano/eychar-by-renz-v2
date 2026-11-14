import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AttendancePolicyModel, AttendanceRecordModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { dateKeyToDate, dateToDateKey, weekdayOf } from "@/lib/date-key";
import { BusinessRuleError } from "@/shared/errors";
import { dateSpanInDays } from "@/shared/validation/schedule";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";
import { PayrollPolicyService } from "@/domains/payroll/payroll-policy-service";
import { AttendancePolicyService } from "./attendance-policy-service";
import { ScheduleService } from "./schedule-service";
import { holidayDayTypesOf } from "@/domains/payroll/holiday-day-types";
import { calculateDay, DAY_CALC_VERSION, type DayCalcPolicy, type DayCalcShift, type DayResult } from "./day-calc";
import { holidayForDay, previousWorkdayStatus, type PreviousWorkday } from "./day-holiday";

/**
 * The stored day result (plan Phase 3): calculateDay's output plus what
 * produced it, saved on the AttendanceRecord. This file does the lookups;
 * day-calc.ts does the arithmetic.
 *
 * Inputs, all as they stand for the record's own date (ENGINEERING.md §27):
 * - attendance policy: the one stored on the record (the policy its status was
 *   judged against), else the one that resolves for that date;
 * - schedule entry: the day's entry, whose shift is a snapshot taken when HR
 *   planned the day; a rest entry makes it a rest day, otherwise the policy's
 *   work week decides;
 * - payroll policy for that date: its daily hours cap regular time, and its
 *   holidayDayTypes say what each holiday type counts as (Phase 4);
 * - holiday: the active one on that date that applies where the employee
 *   works (day-holiday.ts); on a holiday, the previous workday's attendance
 *   is recorded too, for payroll's unworked-holiday rule.
 */

export type StoredDayResult = DayResult & {
  calcVersion: number;
  calculatedAt: Date;
  policyId?: Types.ObjectId;
  scheduleEntryId?: Types.ObjectId;
  holidayId?: Types.ObjectId;
  payrollPolicyId?: Types.ObjectId;
  regularMinutesCap?: number;
  /** Only on holidays: the employee's last workday before it (Phase 4). */
  previousWorkday?: PreviousWorkday;
};

type Id = Types.ObjectId | string;

export type DayResultSource = {
  organizationId: Id;
  employeeId: Id;
  /** The record's calendar day (UTC midnight of the organization's day). */
  date: Date;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  /** The project the policy is resolved for: the site clocked in at, else the assignment that day. */
  projectId?: Id | null;
  policyId?: Id | null;
  overtimeApproved?: boolean | null;
};

export async function buildDayResult(source: DayResultSource): Promise<StoredDayResult> {
  await connectMongoDB();
  const organizationId = source.organizationId.toString();
  const employeeId = source.employeeId.toString();
  const dateKey = dateToDateKey(source.date);
  const projectId = source.projectId?.toString() ?? (await EmployeeAssignmentService.getAsOf(employeeId, source.date))?.projectId?.toString();

  const [policy, entry, payroll] = await Promise.all([
    source.policyId
      ? AttendancePolicyModel.findOne({ _id: new Types.ObjectId(source.policyId.toString()), organizationId: new Types.ObjectId(organizationId) }).lean()
      : AttendancePolicyService.resolve({ organizationId, projectId, effectiveDate: source.date }).then((resolved) => resolved?.policy ?? null),
    ScheduleService.getEntryForDate(organizationId, employeeId, dateKey),
    PayrollPolicyService.resolve({ organizationId, projectId, effectiveDate: source.date }),
  ]);

  const shift = entry?.shift.kind === "work" ? (entry.shift as DayCalcShift) : null;
  let restDay = false;
  if (entry) restDay = entry.shift.kind === "rest";
  else if (policy) restDay = !(policy.workDays ?? []).includes(weekdayOf(dateKey));
  const regularMinutesCap = payroll?.policy.hoursPerDay ? Math.round(payroll.policy.hoursPerDay * 60) : undefined;
  const holiday = await holidayForDay({ organizationId, dateKey, projectId, mapping: holidayDayTypesOf(payroll?.policy) });
  const previousWorkday = holiday ? await previousWorkdayStatus({ organizationId, employeeId, date: dateKey, projectId }) : null;

  const result = calculateDay({
    date: dateKey,
    checkInAt: source.checkInAt,
    checkOutAt: source.checkOutAt,
    shift,
    restDay,
    holiday: holiday ? { dayType: holiday.dayType, dayOff: holiday.dayOff } : null,
    policy: (policy as DayCalcPolicy | null) ?? null,
    overtimeApproved: Boolean(source.overtimeApproved),
    regularMinutesCap,
  });

  return {
    ...result,
    calcVersion: DAY_CALC_VERSION,
    calculatedAt: new Date(),
    ...(policy ? { policyId: policy._id as Types.ObjectId } : {}),
    ...(entry ? { scheduleEntryId: entry._id as Types.ObjectId } : {}),
    ...(payroll ? { payrollPolicyId: payroll.policy._id as Types.ObjectId } : {}),
    ...(regularMinutesCap !== undefined ? { regularMinutesCap } : {}),
    ...(holiday ? { holidayId: holiday.holidayId } : {}),
    ...(previousWorkday ? { previousWorkday } : {}),
  };
}

/** The part of a result that matters, for audits and for "did it change?". */
export function dayResultSummary(result: Partial<StoredDayResult> | null | undefined) {
  if (!result) return null;
  return {
    scheduledMinutes: result.scheduledMinutes,
    workedMinutes: result.workedMinutes,
    lateMinutes: result.lateMinutes,
    undertimeMinutes: result.undertimeMinutes,
    overtimeMinutes: result.overtimeMinutes,
    nightDiffMinutes: result.nightDiffMinutes,
    dayType: result.dayType,
    restDay: result.restDay,
    flags: [...(result.flags ?? [])],
    calcVersion: result.calcVersion,
    policyId: result.policyId?.toString(),
    scheduleEntryId: result.scheduleEntryId?.toString(),
    holidayId: result.holidayId?.toString(),
    payrollPolicyId: result.payrollPolicyId?.toString(),
    regularMinutesCap: result.regularMinutesCap,
    previousWorkday: result.previousWorkday
      ? { date: new Date(result.previousWorkday.date).toISOString(), attended: result.previousWorkday.attended, onLeave: result.previousWorkday.onLeave }
      : undefined,
  };
}

export function sameDayResult(a: Partial<StoredDayResult> | null | undefined, b: Partial<StoredDayResult> | null | undefined): boolean {
  return JSON.stringify(dayResultSummary(a)) === JSON.stringify(dayResultSummary(b));
}

/** The longest range one recalculation covers: about two pay periods. */
export const MAX_RECALCULATE_DAYS = 62;

const SOURCE_FIELDS = "organizationId employeeId date checkInAt checkOutAt projectId policyId overtimeApproved dayResult updatedAt";

type RecordLean = DayResultSource & { _id: Types.ObjectId; dayResult?: StoredDayResult | null; updatedAt?: Date };

export const DayResultService = {
  /**
   * HR's explicit "recalculate" (plan Phase 3, owner decision 11): re-measures
   * the stored day results over a range, e.g. after a schedule is changed for
   * days already recorded. Nothing is ever rewritten silently: only days whose
   * result changes are written, each with an attendance.recalculated audit
   * entry (before/after). The route requires attendance.recalculate.
   */
  async recalculate(input: { organizationId: string; from: string; to: string; employeeId?: string }, actor: { userId?: string }) {
    if (dateSpanInDays(input.from, input.to) > MAX_RECALCULATE_DAYS) {
      throw new BusinessRuleError(`Recalculate at most ${MAX_RECALCULATE_DAYS} days at a time`);
    }
    await connectMongoDB();
    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(input.organizationId),
      date: { $gte: dateKeyToDate(input.from), $lte: dateKeyToDate(input.to) },
    };
    if (input.employeeId) filter.employeeId = new Types.ObjectId(input.employeeId);
    const records = await AttendanceRecordModel.find(filter).select(SOURCE_FIELDS).sort({ date: 1, _id: 1 }).lean<RecordLean[]>();

    let changed = 0;
    for (const record of records) {
      const next = await buildDayResult(record);
      if (sameDayResult(record.dayResult, next)) continue;
      // Skipped if the record was edited meanwhile (an adjust already re-measured it).
      const saved = await AttendanceRecordModel.updateOne({ _id: record._id, updatedAt: record.updatedAt }, { $set: { dayResult: next } });
      if (saved.modifiedCount === 0) continue;
      changed += 1;
      await AuditService.record({
        organizationId: input.organizationId,
        actorUserId: actor.userId,
        action: "attendance.recalculated",
        resourceType: "AttendanceRecord",
        resourceId: record._id.toString(),
        before: dayResultSummary(record.dayResult),
        after: dayResultSummary(next),
        metadata: { range: { from: input.from, to: input.to } },
      });
    }
    return { scanned: records.length, changed };
  },
};
