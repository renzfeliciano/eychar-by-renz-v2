import { describe, it, expect } from "vitest";
import { zonedInstant } from "@/lib/app-time";
import { summarizeAttendance } from "@/domains/payroll/payroll-attendance";
import { dateKeysBetween } from "@/lib/date-key";

const POLICY = { standardStartTime: "08:00", standardEndTime: "17:00" };
// Local wall-clock times, the way attendance check-ins are read everywhere else.
// Wall-clock times in the organization's zone (Asia/Manila), whatever timezone the test machine runs in.
const at = (key: string, hours: number, minutes: number) => zonedInstant(key, `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);

describe("summarizeAttendance", () => {
  // 2026-10-05 (Mon) to 2026-10-11 (Sun): five workdays under a Mon–Fri week.
  const periodDays = dateKeysBetween("2026-10-05", "2026-10-11");

  it("counts worked, leave, absent and missing workdays, and minutes late or short", () => {
    const summary = summarizeAttendance({
      periodDays,
      workWeekDays: [1, 2, 3, 4, 5],
      isEligible: () => true,
      records: [
        { date: "2026-10-05", status: "present", checkInAt: at("2026-10-05", 7, 55), checkOutAt: at("2026-10-05", 17, 5), policy: POLICY },
        { date: "2026-10-06", status: "late", checkInAt: at("2026-10-06", 8, 25), checkOutAt: at("2026-10-06", 16, 30), policy: POLICY },
        { date: "2026-10-07", status: "on_leave", policy: POLICY },
        { date: "2026-10-08", status: "absent", policy: POLICY },
        // Friday has no record at all; Saturday was worked although it's a rest day.
        { date: "2026-10-10", status: "present", checkInAt: at("2026-10-10", 8, 0), checkOutAt: at("2026-10-10", 17, 0), policy: POLICY },
      ],
    });

    expect(summary).toEqual({
      scheduledDays: 5,
      eligibleDays: 5,
      daysWorked: 2,
      paidLeaveDays: 1,
      absentDays: 1,
      missingDays: 1,
      restDaysWorked: 1,
      lateMinutes: 25,
      undertimeMinutes: 30,
    });
  });

  it("only counts days the employee was employed", () => {
    const summary = summarizeAttendance({
      periodDays,
      workWeekDays: [1, 2, 3, 4, 5],
      // Hired on Wednesday.
      isEligible: (date) => date >= "2026-10-07",
      records: [{ date: "2026-10-05", status: "present", checkInAt: at("2026-10-05", 8, 0), policy: POLICY }],
    });
    expect(summary).toMatchObject({ scheduledDays: 5, eligibleDays: 3, daysWorked: 0, missingDays: 3 });
  });

  it("doesn't count minutes late within the grace period (status stays present)", () => {
    const summary = summarizeAttendance({
      periodDays: ["2026-10-05"],
      workWeekDays: [1],
      isEligible: () => true,
      records: [{ date: "2026-10-05", status: "present", checkInAt: at("2026-10-05", 8, 9), checkOutAt: at("2026-10-05", 17, 0), policy: POLICY }],
    });
    expect(summary.lateMinutes).toBe(0);
  });
});

// Attendance plan Phase 5: a run with computePremiums reads the stored day results.
describe("summarizeAttendance with premiums (plan Phase 5)", () => {
  const periodDays = dateKeysBetween("2026-10-05", "2026-10-11");
  const result = (overrides: Record<string, unknown>) => ({
    workedMinutes: 480,
    lateMinutes: 0,
    undertimeMinutes: 0,
    overtimeMinutes: 0,
    nightDiffMinutes: 0,
    nightOvertimeMinutes: 0,
    dayType: "workday",
    restDay: false,
    flags: [] as string[],
    ...overrides,
  });
  const worked = (date: string, dayResult?: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    date,
    status: "present",
    checkInAt: at(date, 8, 0),
    checkOutAt: at(date, 17, 0),
    policy: POLICY,
    dayResult: dayResult ? result(dayResult) : undefined,
    ...extra,
  });
  const noHolidays = { holidays: new Map(), previousWorkday: new Map() };

  it("takes late and undertime from the stored results, and lists the premium days", () => {
    const summary = summarizeAttendance({
      periodDays,
      workWeekDays: [1, 2, 3, 4, 5],
      isEligible: () => true,
      premiums: noHolidays,
      records: [
        worked("2026-10-05", { lateMinutes: 12, undertimeMinutes: 5 }),
        worked("2026-10-06", { workedMinutes: 600, overtimeMinutes: 120, nightDiffMinutes: 60, nightOvertimeMinutes: 60 }, { overtimeApproved: true }),
        worked("2026-10-10", { dayType: "rest_day", restDay: true }),
      ],
    });

    expect(summary).toMatchObject({ daysWorked: 2, restDaysWorked: 1, lateMinutes: 12, undertimeMinutes: 5, missingDays: 3 });
    expect(summary.premiums?.days).toEqual([
      { date: "2026-10-05", dayType: "workday", restDay: false, inBasic: true, regularMinutes: 480, overtimeMinutes: 0, nightMinutes: 0, nightOvertimeMinutes: 0 },
      { date: "2026-10-06", dayType: "workday", restDay: false, inBasic: true, regularMinutes: 480, overtimeMinutes: 120, nightMinutes: 60, nightOvertimeMinutes: 60 },
      { date: "2026-10-10", dayType: "rest_day", restDay: true, inBasic: false, regularMinutes: 480, overtimeMinutes: 0, nightMinutes: 0, nightOvertimeMinutes: 0 },
    ]);
  });

  it("pays no unapproved overtime, nor its night minutes, and counts it", () => {
    const summary = summarizeAttendance({
      periodDays: ["2026-10-06"],
      workWeekDays: [2],
      isEligible: () => true,
      premiums: noHolidays,
      records: [worked("2026-10-06", { workedMinutes: 600, overtimeMinutes: 120, nightDiffMinutes: 90, nightOvertimeMinutes: 60 })],
    });
    expect(summary.premiums?.days[0]).toMatchObject({ overtimeMinutes: 0, nightMinutes: 30, nightOvertimeMinutes: 0, regularMinutes: 480 });
    expect(summary.premiums?.unapprovedOvertimeMinutes).toBe(120);
  });

  it("an older record without a stored result is read as before, and counted", () => {
    const summary = summarizeAttendance({
      periodDays: ["2026-10-06"],
      workWeekDays: [2],
      isEligible: () => true,
      premiums: noHolidays,
      records: [{ date: "2026-10-06", status: "late", checkInAt: at("2026-10-06", 8, 25), checkOutAt: at("2026-10-06", 17, 0), policy: POLICY }],
    });
    expect(summary).toMatchObject({ daysWorked: 1, lateMinutes: 25 });
    expect(summary.premiums).toMatchObject({ days: [], withoutDayResult: 1 });
  });

  it("a day-off holiday is neither missing nor absent; an unworked regular holiday is paid when the workday before was attended or on leave", () => {
    const holidays = new Map([
      ["2026-10-05", { dayType: "regular_holiday", dayOff: true }],
      ["2026-10-06", { dayType: "regular_holiday", dayOff: true }],
      ["2026-10-07", { dayType: "special_holiday", dayOff: true }],
    ]);
    const previousWorkday = new Map([
      ["2026-10-05", { attended: true, onLeave: false }],
      ["2026-10-06", { attended: false, onLeave: false }],
    ]);
    const summary = summarizeAttendance({
      periodDays,
      workWeekDays: [1, 2, 3, 4, 5],
      isEligible: () => true,
      premiums: { holidays, previousWorkday },
      // Tuesday's record says absent: on a day-off holiday that isn't an absence.
      records: [{ date: "2026-10-06", status: "absent", policy: POLICY }, worked("2026-10-08", {}), worked("2026-10-09", {}, { checkOutAt: null, dayResult: result({ workedMinutes: 0, flags: ["missing_checkout"] }) })],
    });

    expect(summary).toMatchObject({ scheduledDays: 5, eligibleDays: 5, daysWorked: 2, absentDays: 0, missingDays: 0 });
    expect(summary.premiums).toMatchObject({ unworkedRegularHolidaysPaid: 1, regularHolidaysAbsentBefore: 1, missingCheckoutDays: 1 });
  });

  it("a worked holiday is a premium day with its day type", () => {
    const summary = summarizeAttendance({
      periodDays: ["2026-10-05"],
      workWeekDays: [1],
      isEligible: () => true,
      premiums: { holidays: new Map([["2026-10-05", { dayType: "regular_holiday", dayOff: true }]]), previousWorkday: new Map() },
      records: [worked("2026-10-05", { dayType: "regular_holiday" })],
    });
    expect(summary).toMatchObject({ daysWorked: 1 });
    expect(summary.premiums).toMatchObject({ unworkedRegularHolidaysPaid: 0, days: [{ dayType: "regular_holiday", inBasic: true, regularMinutes: 480 }] });
  });
});
