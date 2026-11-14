import { weekdayOf } from "@/lib/date-key";
import { minutesOfDayInAppZone } from "@/lib/app-time";
import type { PayAttendance, PremiumAttendance } from "./engine/compute-pay";
import type { PremiumDay } from "./engine/premium-pay";
import type { DayType } from "@/domains/attendance/day-calc";

export type AttendanceDayInput = {
  date: string;
  status: string;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  /** The attendance policy the record was judged against (ADR-011), for its start and end times. */
  policy?: { standardStartTime: string; standardEndTime: string } | null;
  /** The stored day result (attendance plan Phase 3); absent on older records. */
  dayResult?: {
    workedMinutes: number;
    lateMinutes: number;
    undertimeMinutes: number;
    overtimeMinutes: number;
    nightDiffMinutes: number;
    nightOvertimeMinutes?: number | null;
    dayType: string;
    restDay: boolean;
    flags?: string[] | null;
  } | null;
  overtimeApproved?: boolean | null;
};

/**
 * What a run that computes premiums also needs (attendance plan Phase 5):
 * the employee's day-off holidays in the period (already mapped through the
 * payroll policy and the employee's site) and, for unworked regular
 * holidays, whether the workday before was attended or on approved leave.
 */
export type PremiumSummaryInputs = {
  holidays: Map<string, { dayType: string; dayOff: boolean }>;
  previousWorkday: Map<string, { attended: boolean; onLeave: boolean } | null>;
};

export type AttendanceSummary = Required<Omit<PayAttendance, "premiums">> & Pick<PayAttendance, "premiums">;

function minutesOfDay(value: Date): number {
  // The organization's wall clock, the same reading as the attendance screens.
  return minutesOfDayInAppZone(value);
}

function parseHHmm(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Reads one employee's attendance over a pay period the way payroll needs
 * it. Only days the employee was employed count. On a workday (the payroll
 * policy's work week):
 * - "absent" is an unpaid absence;
 * - "on_leave" is paid leave (leave without pay is recorded as absent);
 * - any other status is a day worked;
 * - no record at all is "missing", which payroll reports rather than guesses.
 * Work on other days is rest-day work. Minutes late only count on "late"
 * days, since attendance already applied the grace period when it set the
 * status; undertime is any check-out before the standard end.
 *
 * With `premiums` (a run that computes premiums, attendance plan Phase 5),
 * records that have a stored day result are read from it instead: its late
 * and undertime minutes, and a premium day for every day worked (only
 * approved overtime, and its night minutes, are paid). A day-off holiday is
 * neither missing nor absent; an unworked regular holiday on a workday is
 * counted as paid when the workday before was attended or on leave, else
 * as "absent before" (a warning, no deduction: owner decision at GATE 3).
 * Older records without a result are read as before and counted.
 */
export function summarizeAttendance({
  periodDays,
  workWeekDays,
  isEligible,
  records,
  premiums,
}: {
  periodDays: string[];
  workWeekDays: number[];
  isEligible: (date: string) => boolean;
  records: AttendanceDayInput[];
  premiums?: PremiumSummaryInputs;
}): AttendanceSummary {
  const recordByDate = new Map(records.map((record) => [record.date, record]));
  const extra: PremiumAttendance | undefined = premiums
    ? { days: [], unworkedRegularHolidaysPaid: 0, regularHolidaysAbsentBefore: 0, unapprovedOvertimeMinutes: 0, missingCheckoutDays: 0, withoutDayResult: 0 }
    : undefined;
  const summary: AttendanceSummary = {
    scheduledDays: 0,
    eligibleDays: 0,
    daysWorked: 0,
    paidLeaveDays: 0,
    absentDays: 0,
    missingDays: 0,
    restDaysWorked: 0,
    lateMinutes: 0,
    undertimeMinutes: 0,
  };

  for (const date of periodDays) {
    const isWorkday = workWeekDays.includes(weekdayOf(date));
    if (isWorkday) summary.scheduledDays += 1;
    if (!isEligible(date)) continue;
    if (isWorkday) summary.eligibleDays += 1;

    const record = recordByDate.get(date);
    const holiday = premiums?.holidays.get(date);
    const worked = record && record.status !== "absent" && record.status !== "on_leave";
    if (extra && holiday?.dayOff && !worked) {
      // A day off for everyone: not missing, not an absence (nor leave taken).
      if (isWorkday && holiday.dayType === "regular_holiday") {
        const before = premiums!.previousWorkday.get(date);
        if (before && (before.attended || before.onLeave)) extra.unworkedRegularHolidaysPaid += 1;
        else extra.regularHolidaysAbsentBefore += 1;
      }
      continue;
    }
    if (!record) {
      if (isWorkday) summary.missingDays += 1;
      continue;
    }
    if (record.status === "absent" || record.status === "on_leave") {
      if (!isWorkday) continue;
      if (record.status === "absent") summary.absentDays += 1;
      else summary.paidLeaveDays += 1;
      continue;
    }

    if (isWorkday) summary.daysWorked += 1;
    else summary.restDaysWorked += 1;

    const result = extra ? record.dayResult : undefined;
    // A status-only record (no clock times) has no hours to measure, so only timed ones count as missing a result.
    if (extra && !result && record.checkInAt) extra.withoutDayResult += 1;
    if (extra && result) {
      if (result.flags?.includes("missing_checkout")) extra.missingCheckoutDays += 1;
      const approved = Boolean(record.overtimeApproved);
      const nightOvertime = Math.min(result.nightOvertimeMinutes ?? 0, result.nightDiffMinutes);
      if (!approved) extra.unapprovedOvertimeMinutes += result.overtimeMinutes;
      const day: PremiumDay = {
        date,
        dayType: result.dayType as DayType,
        restDay: result.restDay,
        inBasic: isWorkday,
        regularMinutes: Math.max(0, result.workedMinutes - result.overtimeMinutes),
        overtimeMinutes: approved ? result.overtimeMinutes : 0,
        nightMinutes: approved ? result.nightDiffMinutes : result.nightDiffMinutes - nightOvertime,
        nightOvertimeMinutes: approved ? nightOvertime : 0,
      };
      extra.days.push(day);
      summary.lateMinutes += result.lateMinutes;
      summary.undertimeMinutes += result.undertimeMinutes;
      continue;
    }

    if (!record.policy) continue;
    if (record.status === "late" && record.checkInAt) {
      summary.lateMinutes += Math.max(0, minutesOfDay(record.checkInAt) - parseHHmm(record.policy.standardStartTime));
    }
    if (record.checkOutAt) {
      summary.undertimeMinutes += Math.max(0, parseHHmm(record.policy.standardEndTime) - minutesOfDay(record.checkOutAt));
    }
  }

  return extra ? { ...summary, premiums: extra } : summary;
}
