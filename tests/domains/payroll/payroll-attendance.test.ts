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
