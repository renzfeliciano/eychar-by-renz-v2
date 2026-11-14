import { appDateKey, zonedInstant } from "@/lib/app-time";
import { addDays } from "@/lib/date-key";

/**
 * One attendance day's worked time, from the resolved inputs (plan Phase 2).
 * Pure: no I/O, same style as payroll's compute-pay.ts. The caller resolves
 * the shift, the policy for the record's own date (§27), whether it's a rest
 * day, the holiday's day type (configuration, Phase 4) and the payroll's
 * daily hours; this only does the arithmetic. All results are whole minutes.
 *
 * Rules (owner decisions 2026-11-14, plan §5):
 * - Expected hours: the scheduled work shift, else the attendance policy's
 *   standard hours (fallback), else nothing to measure against.
 * - Late: the full minutes after the start once past the grace period
 *   (grace gates, as computeStatus and payroll do today). Flexible shifts:
 *   after the latest start.
 * - Overtime starts after the scheduled end. Regular time inside the shift is
 *   capped at the payroll's daily hours, so a shift longer than that has the
 *   excess as overtime too. Coming in early is not overtime. Overtime is
 *   reported either way and flagged until approved.
 * - The break is deducted only when the time worked exceeds it.
 * - Night differential: minutes inside the policy's night window. Those that
 *   are also overtime are counted apart (nightOvertimeMinutes, owner decision
 *   at Gate 3: night differential on overtime is at the overtime rate).
 *   Overtime is taken as the last minutes worked before check-out.
 * - Rounding: late, undertime, overtime and night minutes round down to the
 *   policy's block (0 = exact minutes).
 * - Missing check-out: flagged, and nothing counts as worked until HR adjusts.
 * - Late and undertime apply only on an ordinary day (workday or special
 *   working day); a rest day or day-off holiday has no hours to be short of.
 */

/** Bumped whenever the rules change. 2: nightOvertimeMinutes (Gate 3). */
export const DAY_CALC_VERSION = 2;

export type DayType = "workday" | "rest_day" | "regular_holiday" | "special_holiday" | "special_working";
export type DayCalcFlag = "missing_checkin" | "missing_checkout" | "crosses_midnight" | "overtime_unapproved";

/** Policy defaults for the time rules, filled in for policies saved before the fields existed. */
export const ATTENDANCE_TIME_RULE_DEFAULTS = {
  breakMinutes: 0,
  roundingMinutes: 0,
  nightStartTime: "22:00",
  nightEndTime: "06:00",
} as const;

export type AttendanceTimeRules = { breakMinutes: number; roundingMinutes: number; nightStartTime: string; nightEndTime: string };

export function timeRulesOf(policy: DayCalcPolicy | { [K in keyof AttendanceTimeRules]?: AttendanceTimeRules[K] | null } | null | undefined): AttendanceTimeRules {
  return {
    breakMinutes: policy?.breakMinutes ?? ATTENDANCE_TIME_RULE_DEFAULTS.breakMinutes,
    roundingMinutes: policy?.roundingMinutes ?? ATTENDANCE_TIME_RULE_DEFAULTS.roundingMinutes,
    nightStartTime: policy?.nightStartTime ?? ATTENDANCE_TIME_RULE_DEFAULTS.nightStartTime,
    nightEndTime: policy?.nightEndTime ?? ATTENDANCE_TIME_RULE_DEFAULTS.nightEndTime,
  };
}

export type DayCalcShift = {
  pattern?: "fixed" | "flexible" | null;
  startTime?: string | null;
  endTime?: string | null;
  latestStartTime?: string | null;
  requiredHours?: number | null;
  breakMinutes?: number | null;
};

export type DayCalcPolicy = {
  standardStartTime: string;
  standardEndTime: string;
  gracePeriodMinutes: number;
} & { [K in keyof AttendanceTimeRules]?: AttendanceTimeRules[K] | null };

export type DayCalcInput = {
  /** The record's calendar day, "YYYY-MM-DD", in the organization's zone. */
  date: string;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  /** The work shift scheduled that day (the schedule entry's snapshot), if any. */
  shift?: DayCalcShift | null;
  /** Resolved by the caller: the schedule's rest day first, then the policy's work week. */
  restDay: boolean;
  /** An active holiday that day, already mapped to a day type by configuration. */
  holiday?: { dayType: Exclude<DayType, "workday" | "rest_day">; dayOff: boolean } | null;
  /** The attendance policy in force on `date`. */
  policy?: DayCalcPolicy | null;
  overtimeApproved?: boolean;
  /** The payroll's daily hours in minutes; regular time beyond it is overtime. */
  regularMinutesCap?: number | null;
};

export type DayResult = {
  scheduledMinutes: number;
  workedMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  overtimeMinutes: number;
  nightDiffMinutes: number;
  /** Of the night minutes, those that are also overtime. */
  nightOvertimeMinutes: number;
  dayType: DayType;
  /** Kept apart from dayType: a holiday can fall on a rest day, and pay differs. */
  restDay: boolean;
  flags: DayCalcFlag[];
};

const MINUTE = 60_000;

function toMinute(instant: Date): number {
  return Math.floor(instant.getTime() / MINUTE);
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** A wall-clock time on a day, in whole minutes since the epoch. */
function at(date: string, time: string): number {
  return toMinute(zonedInstant(date, time));
}

/** start..end on `date`; an end at or before the start is the next morning. */
function span(date: string, start: string, end: string): { start: number; end: number } {
  return { start: at(date, start), end: minutesOf(end) <= minutesOf(start) ? at(addDays(date, 1), end) : at(date, end) };
}

function overlap(a: { start: number; end: number }, b: { start: number; end: number }): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

function roundDown(value: number, block: number): number {
  return block > 1 ? Math.floor(value / block) * block : value;
}

/** Deducted only when the time is longer than the break. */
function lessBreak(minutes: number, breakMinutes: number): number {
  return minutes > breakMinutes ? minutes - breakMinutes : minutes;
}

type Expected =
  | { kind: "fixed"; start: number; end: number; lateFrom: number; lateAfter: number; breakMinutes: number; scheduled: number }
  | { kind: "flexible"; start: number; lateFrom: number; lateAfter: number; requiredMinutes: number; breakMinutes: number; scheduled: number };

function expectedHours(input: DayCalcInput, rules: AttendanceTimeRules): Expected | null {
  const grace = input.policy?.gracePeriodMinutes ?? 0;
  const shift = input.shift;
  if (shift && shift.pattern === "flexible" && shift.startTime && shift.requiredHours) {
    const breakMinutes = shift.breakMinutes ?? 0;
    const requiredMinutes = Math.round(shift.requiredHours * 60);
    const latest = at(input.date, shift.latestStartTime ?? shift.startTime);
    return { kind: "flexible", start: at(input.date, shift.startTime), lateFrom: latest, lateAfter: latest + grace, requiredMinutes, breakMinutes, scheduled: requiredMinutes };
  }
  if (shift && shift.startTime && shift.endTime) {
    const breakMinutes = shift.breakMinutes ?? 0;
    const window = span(input.date, shift.startTime, shift.endTime);
    return { kind: "fixed", ...window, lateFrom: window.start, lateAfter: window.start + grace, breakMinutes, scheduled: lessBreak(window.end - window.start, breakMinutes) };
  }
  if (shift) return null;
  // No shift: the policy's standard hours, on days the employee is expected to work.
  if (!input.policy || input.restDay || input.holiday?.dayOff) return null;
  const window = span(input.date, input.policy.standardStartTime, input.policy.standardEndTime);
  return { kind: "fixed", ...window, lateFrom: window.start, lateAfter: window.start + grace, breakMinutes: rules.breakMinutes, scheduled: lessBreak(window.end - window.start, rules.breakMinutes) };
}

function dayTypeOf(input: DayCalcInput): DayType {
  if (input.holiday) return input.holiday.dayType;
  return input.restDay ? "rest_day" : "workday";
}

export function calculateDay(input: DayCalcInput): DayResult {
  const rules = timeRulesOf(input.policy);
  const expected = expectedHours(input, rules);
  const dayType = dayTypeOf(input);
  const ordinaryDay = dayType === "workday" || dayType === "special_working";
  const flags: DayCalcFlag[] = [];

  const result: DayResult = {
    scheduledMinutes: ordinaryDay || input.shift ? (expected?.scheduled ?? 0) : 0,
    workedMinutes: 0,
    lateMinutes: 0,
    undertimeMinutes: 0,
    overtimeMinutes: 0,
    nightDiffMinutes: 0,
    nightOvertimeMinutes: 0,
    dayType,
    restDay: input.restDay,
    flags,
  };

  const checkIn = input.checkInAt ? toMinute(input.checkInAt) : null;
  const checkOut = input.checkOutAt ? toMinute(input.checkOutAt) : null;

  if (checkIn !== null && expected && ordinaryDay) {
    if (checkIn > expected.lateAfter) result.lateMinutes = roundDown(checkIn - expected.lateFrom, rules.roundingMinutes);
  }

  if (checkIn === null || checkOut === null || checkOut <= checkIn) {
    if (checkIn === null && checkOut !== null) flags.push("missing_checkin");
    if (checkIn !== null && checkOut === null) flags.push("missing_checkout");
    return result;
  }

  const breakMinutes = expected?.breakMinutes ?? (input.shift ? (input.shift.breakMinutes ?? 0) : rules.breakMinutes);
  result.workedMinutes = lessBreak(checkOut - checkIn, breakMinutes);

  // The window regular time is measured in, and when the day's hours end.
  let window: { start: number; end: number } | null = null;
  if (expected?.kind === "fixed") window = { start: expected.start, end: expected.end };
  if (expected?.kind === "flexible") {
    const start = Math.max(checkIn, expected.start);
    window = { start, end: start + expected.requiredMinutes + expected.breakMinutes };
  }

  let overtime: number;
  if (window) {
    const afterEnd = Math.max(0, checkOut - Math.max(window.end, checkIn));
    const cap = input.regularMinutesCap ?? expected!.scheduled;
    const regular = lessBreak(overlap({ start: checkIn, end: checkOut }, window), breakMinutes);
    overtime = afterEnd + Math.max(0, regular - cap);
    if (ordinaryDay) result.undertimeMinutes = roundDown(Math.max(0, window.end - checkOut), rules.roundingMinutes);
  } else {
    overtime = input.regularMinutesCap != null ? Math.max(0, result.workedMinutes - input.regularMinutesCap) : 0;
  }
  result.overtimeMinutes = roundDown(Math.min(overtime, result.workedMinutes), rules.roundingMinutes);

  const nightIn = (interval: { start: number; end: number }) =>
    [-1, 0, 1].reduce((sum, offset) => sum + overlap(interval, span(addDays(input.date, offset), rules.nightStartTime, rules.nightEndTime)), 0);
  result.nightDiffMinutes = roundDown(nightIn({ start: checkIn, end: checkOut }), rules.roundingMinutes);
  const overtimeSpan = { start: checkOut - Math.min(overtime, result.workedMinutes), end: checkOut };
  result.nightOvertimeMinutes = Math.min(roundDown(nightIn(overtimeSpan), rules.roundingMinutes), result.nightDiffMinutes, result.overtimeMinutes);

  if (appDateKey(new Date(checkIn * MINUTE)) !== appDateKey(new Date(checkOut * MINUTE))) flags.push("crosses_midnight");
  if (result.overtimeMinutes > 0 && !input.overtimeApproved) flags.push("overtime_unapproved");
  return result;
}
