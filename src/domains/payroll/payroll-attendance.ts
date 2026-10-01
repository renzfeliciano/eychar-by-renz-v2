import { weekdayOf } from "@/lib/date-key";
import { minutesOfDayInAppZone } from "@/lib/app-time";
import type { PayAttendance } from "./engine/compute-pay";

export type AttendanceDayInput = {
  date: string;
  status: string;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  /** The attendance policy the record was judged against (ADR-011), for its start and end times. */
  policy?: { standardStartTime: string; standardEndTime: string } | null;
};

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
 */
export function summarizeAttendance({
  periodDays,
  workWeekDays,
  isEligible,
  records,
}: {
  periodDays: string[];
  workWeekDays: number[];
  isEligible: (date: string) => boolean;
  records: AttendanceDayInput[];
}): Required<PayAttendance> {
  const recordByDate = new Map(records.map((record) => [record.date, record]));
  const summary: Required<PayAttendance> = {
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

    if (!record.policy) continue;
    if (record.status === "late" && record.checkInAt) {
      summary.lateMinutes += Math.max(0, minutesOfDay(record.checkInAt) - parseHHmm(record.policy.standardStartTime));
    }
    if (record.checkOutAt) {
      summary.undertimeMinutes += Math.max(0, parseHHmm(record.policy.standardEndTime) - minutesOfDay(record.checkOutAt));
    }
  }

  return summary;
}
