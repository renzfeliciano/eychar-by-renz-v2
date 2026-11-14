import { describe, it, expect } from "vitest";
import { zonedInstant } from "@/lib/app-time";
import { calculateDay, timeRulesOf, ATTENDANCE_TIME_RULE_DEFAULTS, type DayCalcInput } from "@/domains/attendance/day-calc";
import { computeStatus } from "@/domains/attendance/attendance-service";
import { summarizeAttendance } from "@/domains/payroll/payroll-attendance";

const D = "2026-11-16"; // a Monday
const at = (time: string, day = D) => zonedInstant(day, time);

const POLICY = { standardStartTime: "09:00", standardEndTime: "18:00", gracePeriodMinutes: 10 };

function day(overrides: Partial<DayCalcInput>): DayCalcInput {
  return { date: D, restDay: false, policy: POLICY, ...overrides };
}

describe("timeRulesOf", () => {
  it("fills the defaults for policies saved before the fields existed", () => {
    expect(timeRulesOf(POLICY)).toEqual(ATTENDANCE_TIME_RULE_DEFAULTS);
    expect(ATTENDANCE_TIME_RULE_DEFAULTS).toEqual({ breakMinutes: 0, roundingMinutes: 0, nightStartTime: "22:00", nightEndTime: "06:00" });
    expect(timeRulesOf({ ...POLICY, roundingMinutes: 15, nightStartTime: "21:00" })).toMatchObject({ roundingMinutes: 15, nightStartTime: "21:00", nightEndTime: "06:00" });
  });
});

describe("calculateDay", () => {
  it("normal day on the policy's hours: no late, undertime or overtime", () => {
    const result = calculateDay(day({ checkInAt: at("08:55"), checkOutAt: at("18:00") }));
    expect(result).toEqual({
      scheduledMinutes: 540,
      workedMinutes: 545,
      lateMinutes: 0,
      undertimeMinutes: 0,
      overtimeMinutes: 0,
      nightDiffMinutes: 0,
      dayType: "workday",
      restDay: false,
      flags: [],
    });
  });

  it("late counts the full minutes after the start once past the grace period, as payroll does today", () => {
    expect(calculateDay(day({ checkInAt: at("09:10"), checkOutAt: at("18:00") })).lateMinutes).toBe(0); // within grace
    expect(calculateDay(day({ checkInAt: at("09:11"), checkOutAt: at("18:00") })).lateMinutes).toBe(11);
  });

  it("undertime is the minutes left before the scheduled end", () => {
    expect(calculateDay(day({ checkInAt: at("09:00"), checkOutAt: at("17:20") })).undertimeMinutes).toBe(40);
  });

  it("overtime starts after the scheduled end and is flagged until approved", () => {
    const unapproved = calculateDay(day({ checkInAt: at("09:00"), checkOutAt: at("19:30") }));
    expect(unapproved.overtimeMinutes).toBe(90);
    expect(unapproved.flags).toEqual(["overtime_unapproved"]);

    const approved = calculateDay(day({ checkInAt: at("09:00"), checkOutAt: at("19:30"), overtimeApproved: true }));
    expect(approved.overtimeMinutes).toBe(90);
    expect(approved.flags).toEqual([]);
  });

  it("coming in early is not overtime", () => {
    expect(calculateDay(day({ checkInAt: at("07:00"), checkOutAt: at("18:00") })).overtimeMinutes).toBe(0);
  });

  it("caps regular time at the payroll's daily hours: a 10-hour shift has 2 hours of overtime", () => {
    const result = calculateDay(day({ shift: { startTime: "07:00", endTime: "17:00" }, checkInAt: at("07:00"), checkOutAt: at("17:00"), regularMinutesCap: 480, overtimeApproved: true }));
    expect(result.scheduledMinutes).toBe(600);
    expect(result.overtimeMinutes).toBe(120);
  });

  it("deducts the shift's break only when the time worked exceeds it", () => {
    const shift = { startTime: "08:00", endTime: "17:00", breakMinutes: 60 };
    expect(calculateDay(day({ shift, checkInAt: at("08:00"), checkOutAt: at("17:00") }))).toMatchObject({ scheduledMinutes: 480, workedMinutes: 480 });
    expect(calculateDay(day({ shift, checkInAt: at("08:00"), checkOutAt: at("08:45") })).workedMinutes).toBe(45);
  });

  it("the scheduled shift wins over the policy's hours", () => {
    const result = calculateDay(day({ shift: { startTime: "06:00", endTime: "15:00" }, checkInAt: at("06:30"), checkOutAt: at("15:00") }));
    expect(result.lateMinutes).toBe(30);
    expect(result.scheduledMinutes).toBe(540);
  });

  it("overnight shift crossing midnight and the Manila day boundary, with night differential", () => {
    // 22:00 on the 16th to 07:00 on the 17th, Manila (14:00Z to 23:00Z on the 16th).
    const shift = { startTime: "22:00", endTime: "07:00", breakMinutes: 60 };
    const result = calculateDay(day({ shift, checkInAt: at("22:00"), checkOutAt: at("07:00", "2026-11-17") }));
    expect(result).toMatchObject({ scheduledMinutes: 480, workedMinutes: 480, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0, nightDiffMinutes: 480 });
    expect(result.flags).toEqual(["crosses_midnight"]);
  });

  it("night differential covers only the minutes inside the policy's night window", () => {
    const result = calculateDay(day({ checkInAt: at("09:00"), checkOutAt: at("23:30"), overtimeApproved: true }));
    expect(result.overtimeMinutes).toBe(330);
    expect(result.nightDiffMinutes).toBe(90);

    const custom = calculateDay(day({ policy: { ...POLICY, nightStartTime: "23:00" }, checkInAt: at("09:00"), checkOutAt: at("23:30"), overtimeApproved: true }));
    expect(custom.nightDiffMinutes).toBe(30);
  });

  it("an early-morning shift picks up the night window before 06:00", () => {
    const result = calculateDay(day({ shift: { startTime: "04:00", endTime: "13:00" }, checkInAt: at("04:00"), checkOutAt: at("13:00") }));
    expect(result.nightDiffMinutes).toBe(120);
  });

  it("flexible shift: late after the latest start, required hours from when they started", () => {
    const shift = { pattern: "flexible" as const, startTime: "07:00", latestStartTime: "10:00", requiredHours: 8, breakMinutes: 60 };
    const onTime = calculateDay(day({ shift, checkInAt: at("09:30"), checkOutAt: at("18:30") }));
    expect(onTime).toMatchObject({ scheduledMinutes: 480, workedMinutes: 480, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0 });

    const late = calculateDay(day({ shift, checkInAt: at("10:30"), checkOutAt: at("18:30") }));
    expect(late).toMatchObject({ lateMinutes: 30, undertimeMinutes: 60 });

    const long = calculateDay(day({ shift, checkInAt: at("07:00"), checkOutAt: at("17:00"), overtimeApproved: true }));
    expect(long.overtimeMinutes).toBe(60);
  });

  it("rest day: no late or undertime; overtime is time past the daily hours", () => {
    const result = calculateDay(day({ restDay: true, checkInAt: at("10:00"), checkOutAt: at("20:00"), regularMinutesCap: 480, overtimeApproved: true }));
    expect(result).toMatchObject({ dayType: "rest_day", restDay: true, scheduledMinutes: 0, workedMinutes: 600, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 120 });
  });

  it("a holiday sets the day type from what the caller resolved, and keeps the rest-day fact separately", () => {
    const regular = calculateDay(day({ holiday: { dayType: "regular_holiday", dayOff: true }, checkInAt: at("09:00"), checkOutAt: at("18:00") }));
    expect(regular).toMatchObject({ dayType: "regular_holiday", restDay: false, scheduledMinutes: 0, lateMinutes: 0, undertimeMinutes: 0 });

    const onRestDay = calculateDay(day({ restDay: true, holiday: { dayType: "special_holiday", dayOff: true } }));
    expect(onRestDay).toMatchObject({ dayType: "special_holiday", restDay: true });

    // A special working day is an ordinary day: the usual hours apply.
    const working = calculateDay(day({ holiday: { dayType: "special_working", dayOff: false }, checkInAt: at("09:30"), checkOutAt: at("18:00") }));
    expect(working).toMatchObject({ dayType: "special_working", scheduledMinutes: 540, lateMinutes: 30 });
  });

  it("missing check-out: flagged, and no time is counted as worked", () => {
    const result = calculateDay(day({ checkInAt: at("09:20") }));
    expect(result).toMatchObject({ workedMinutes: 0, lateMinutes: 20, undertimeMinutes: 0, overtimeMinutes: 0, nightDiffMinutes: 0 });
    expect(result.flags).toEqual(["missing_checkout"]);
  });

  it("a status-only day (no times) counts nothing and raises no flags", () => {
    expect(calculateDay(day({}))).toMatchObject({ scheduledMinutes: 540, workedMinutes: 0, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0, flags: [] });
  });

  it("without a policy or shift there is nothing to measure against", () => {
    const result = calculateDay(day({ policy: null, checkInAt: at("09:00"), checkOutAt: at("18:00") }));
    expect(result).toMatchObject({ scheduledMinutes: 0, workedMinutes: 540, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0 });
  });

  it("rounds late, undertime, overtime and night minutes down to the policy's block", () => {
    const policy = { ...POLICY, roundingMinutes: 15 };
    const result = calculateDay(day({ policy, checkInAt: at("09:14"), checkOutAt: at("19:29"), overtimeApproved: true }));
    expect(result).toMatchObject({ lateMinutes: 0, overtimeMinutes: 75 });
  });

  it("ignores seconds, like the present/late decision", () => {
    const checkInAt = new Date(at("09:11").getTime() + 59_000);
    expect(calculateDay(day({ checkInAt, checkOutAt: at("18:00") })).lateMinutes).toBe(11);
  });

  describe("characterization: policies without the new fields give today's results", () => {
    const times = ["06:00", "08:59", "09:00", "09:10", "09:11", "09:45", "12:00"];
    const outs = ["12:00", "17:59", "18:00", "19:00"];

    it("late minutes > 0 exactly when computeStatus says late", () => {
      for (const time of times) {
        const status = computeStatus(at(time), POLICY);
        expect(calculateDay(day({ checkInAt: at(time), checkOutAt: at("18:00") })).lateMinutes > 0, time).toBe(status === "late");
      }
    });

    it("late and undertime minutes match what payroll sums today", () => {
      for (const time of times) {
        for (const out of outs) {
          const checkInAt = at(time);
          const checkOutAt = at(out);
          if (checkOutAt <= checkInAt) continue;
          const status = computeStatus(checkInAt, POLICY);
          const today = summarizeAttendance({
            periodDays: [D],
            workWeekDays: [1, 2, 3, 4, 5],
            isEligible: () => true,
            records: [{ date: D, status, checkInAt, checkOutAt, policy: POLICY }],
          });
          const result = calculateDay(day({ checkInAt, checkOutAt }));
          expect({ late: result.lateMinutes, undertime: result.undertimeMinutes }, `${time}-${out}`).toEqual({ late: today.lateMinutes, undertime: today.undertimeMinutes });
        }
      }
    });
  });
});
