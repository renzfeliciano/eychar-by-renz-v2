import { describe, it, expect } from "vitest";
import { premiumLines, type PremiumDay } from "@/domains/payroll/engine/premium-pay";
import { PAY_PREMIUM_DEFAULTS, payPremiumsOf } from "@/domains/payroll/engine/premiums";

// The worked examples approved at GATE 3 (2026-11-14): ₱25,000 a month,
// 261 workdays a year, 8 hours a day -> daily ₱1,149.43, hourly ₱143.68.
const DAILY = 1149.43;
const HOURLY = 143.68;
const premiums = payPremiumsOf(null);

function day(overrides: Partial<PremiumDay>): PremiumDay {
  return { date: "2026-10-05", dayType: "workday", restDay: false, inBasic: true, regularMinutes: 480, overtimeMinutes: 120, nightMinutes: 0, nightOvertimeMinutes: 0, ...overrides };
}

const linesFor = (days: PremiumDay[]) => premiumLines({ days, dailyRate: DAILY, hourlyRate: HOURLY, hoursPerDay: 8, premiums });
const amounts = (days: PremiumDay[]) => Object.fromEntries(linesFor(days).map((line) => [line.code, line.amount]));

describe("premium pay defaults (GATE 3)", () => {
  it("adds the approved multipliers, filled in for policies saved before them", () => {
    expect(PAY_PREMIUM_DEFAULTS).toMatchObject({
      overtimeMultiplier: 1.25,
      restDayMultiplier: 1.3,
      specialHolidayMultiplier: 1.3,
      specialHolidayRestDayMultiplier: 1.5,
      regularHolidayMultiplier: 2,
      regularHolidayRestDayMultiplier: 2.6,
      premiumOvertimeMultiplier: 1.3,
      nightDifferentialRate: 0.1,
    });
    expect(payPremiumsOf({ regularHolidayMultiplier: 2.5 })).toMatchObject({ regularHolidayMultiplier: 2.5, specialHolidayMultiplier: 1.3 });
  });
});

describe("premiumLines: the GATE 3 worked examples", () => {
  it("ordinary day: overtime at 125%, the regular hours are already in basic", () => {
    expect(amounts([day({})])).toEqual({ overtime: 359.2 });
  });

  it("rest day: 130% in full, overtime at 169%", () => {
    expect(amounts([day({ dayType: "rest_day", restDay: true, inBasic: false })])).toEqual({ rest_day_pay: 1494.26, overtime: 485.64 });
  });

  it("special non-working day: the extra 30%, overtime at 169%", () => {
    expect(amounts([day({ dayType: "special_holiday" })])).toEqual({ holiday_pay: 344.83, overtime: 485.64 });
  });

  it("special day on a rest day: 150% in full, overtime at 195%", () => {
    expect(amounts([day({ dayType: "special_holiday", restDay: true, inBasic: false })])).toEqual({ holiday_pay: 1724.15, overtime: 560.35 });
  });

  it("regular holiday: the extra 100%, overtime at 260%", () => {
    expect(amounts([day({ dayType: "regular_holiday" })])).toEqual({ holiday_pay: 1149.43, overtime: 747.14 });
  });

  it("regular holiday on a rest day: 260% in full, overtime at 338%", () => {
    expect(amounts([day({ dayType: "regular_holiday", restDay: true, inBasic: false })])).toEqual({ holiday_pay: 2988.52, overtime: 971.28 });
  });

  it("special working day pays as an ordinary day", () => {
    expect(amounts([day({ dayType: "special_working" })])).toEqual({ overtime: 359.2 });
  });

  it("night differential: 10% of the day's hourly rate", () => {
    expect(amounts([day({ overtimeMinutes: 0, nightMinutes: 480 })])).toEqual({ night_differential: 114.94 });
    expect(amounts([day({ dayType: "regular_holiday", overtimeMinutes: 0, nightMinutes: 480 })])).toEqual({ holiday_pay: 1149.43, night_differential: 229.89 });
  });

  it("night minutes that are also overtime take 10% of the overtime rate", () => {
    // 60 night minutes, all overtime, on an ordinary day: 143.68 x 1.25 x 0.10 x 1 h = 17.96.
    expect(amounts([day({ overtimeMinutes: 60, nightMinutes: 60, nightOvertimeMinutes: 60 })]).night_differential).toBe(17.96);
  });

  it("a rest day inside the payroll's work week pays only the extra 30% (basic already pays it)", () => {
    expect(amounts([day({ dayType: "rest_day", restDay: true, inBasic: true, overtimeMinutes: 0 })])).toEqual({ rest_day_pay: 344.83 });
  });

  it("adds up the period's minutes per kind of day, one line each, rounded as produced", () => {
    const lines = linesFor([day({ date: "2026-10-05" }), day({ date: "2026-10-06" }), day({ date: "2026-10-07", dayType: "regular_holiday", overtimeMinutes: 0 })]);
    expect(lines).toEqual([
      { code: "overtime", label: "Overtime, ordinary day (4 h)", amount: 718.4, taxable: true },
      { code: "holiday_pay", label: "Regular holiday premium (8 h)", amount: 1149.43, taxable: true },
    ]);
  });

  it("nothing to add on an ordinary day without overtime or night work", () => {
    expect(linesFor([day({ overtimeMinutes: 0 })])).toEqual([]);
  });
});

import { computeEmployeePay, type PayInput } from "@/domains/payroll/engine/compute-pay";

describe("computeEmployeePay with premiums (plan Phase 5)", () => {
  const base = (overrides: Partial<PayInput> = {}): PayInput => ({
    compensation: { rateType: "monthly", rate: 25000, allowances: [], minimumWageEarner: true },
    policy: { payFrequency: "monthly", workDaysPerYear: 261, hoursPerDay: 8, deductLateAndUndertime: true, contributionTiming: "every_cutoff" },
    rules: { taxTable: [], contributions: [] },
    attendance: { scheduledDays: 5, eligibleDays: 5, daysWorked: 4, paidLeaveDays: 0, absentDays: 0, missingDays: 0, restDaysWorked: 1, lateMinutes: 0, undertimeMinutes: 0 },
    adjustments: [],
    isLastCutoffOfMonth: true,
    ...overrides,
  });
  const premiumAttendance = (overrides: Record<string, unknown> = {}) => ({
    days: [day({ dayType: "rest_day", restDay: true, inBasic: false, overtimeMinutes: 0, date: "2026-10-10" })],
    unworkedRegularHolidaysPaid: 0,
    regularHolidaysAbsentBefore: 0,
    unapprovedOvertimeMinutes: 0,
    missingCheckoutDays: 0,
    withoutDayResult: 0,
    ...overrides,
  });

  it("without computePremiums nothing changes: the rest-day warning stays and no premium lines appear", () => {
    const pay = computeEmployeePay(base({ attendance: { ...base().attendance, premiums: premiumAttendance() } }));
    expect(pay.earnings.map((line) => line.code)).toEqual(["basic"]);
    expect(pay.warnings.map((warning) => warning.code)).toContain("rest_day_work");
  });

  it("with computePremiums adds the lines, and drops the rest-day reminder", () => {
    const pay = computeEmployeePay(base({ computePremiums: true, attendance: { ...base().attendance, premiums: premiumAttendance() } }));
    expect(pay.earnings).toContainEqual({ code: "rest_day_pay", label: "Rest day pay (8 h)", amount: 1494.26, taxable: true });
    expect(pay.grossPay).toBe(25000 + 1494.26);
    expect(pay.warnings.map((warning) => warning.code)).not.toContain("rest_day_work");
  });

  it("uses the policy's own multipliers", () => {
    const pay = computeEmployeePay(base({ computePremiums: true, policy: { ...base().policy, restDayMultiplier: 1.5 }, attendance: { ...base().attendance, premiums: premiumAttendance() } }));
    expect(pay.earnings.find((line) => line.code === "rest_day_pay")?.amount).toBe(1724.15);
  });

  it("pays a daily-rated employee's unworked regular holidays; a monthly one already has them in basic", () => {
    const attendance = { ...base().attendance, premiums: premiumAttendance({ days: [], unworkedRegularHolidaysPaid: 1 }) };
    const daily = computeEmployeePay(base({ computePremiums: true, compensation: { rateType: "daily", rate: 695, allowances: [], minimumWageEarner: true }, attendance }));
    expect(daily.earnings).toContainEqual({ code: "holiday_pay", label: "Regular holiday pay, not worked (1 day)", amount: 695, taxable: true });
    const monthly = computeEmployeePay(base({ computePremiums: true, attendance }));
    expect(monthly.earnings.map((line) => line.code)).toEqual(["basic"]);
  });

  it("warns about unapproved overtime, missing check-outs, older records and an absence before a regular holiday, never deducting", () => {
    const pay = computeEmployeePay(base({
      computePremiums: true,
      attendance: { ...base().attendance, premiums: premiumAttendance({ days: [], unapprovedOvertimeMinutes: 90, missingCheckoutDays: 1, withoutDayResult: 2, regularHolidaysAbsentBefore: 1 }) },
    }));
    expect(pay.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(["unapproved_overtime", "missing_checkout", "day_result_missing", "holiday_absent_before"]));
    expect(pay.warnings.every((warning) => !warning.blocking)).toBe(true);
    expect(pay.grossPay).toBe(25000);
  });

  it("blocks a manual premium adjustment on a run that computes premiums (no double counting)", () => {
    const pay = computeEmployeePay(base({
      computePremiums: true,
      attendance: { ...base().attendance, premiums: premiumAttendance({ days: [] }) },
      adjustments: [{ category: "overtime", label: "OT", direction: "earning", amount: 500, taxable: true }],
    }));
    expect(pay.warnings).toContainEqual(expect.objectContaining({ code: "manual_premium_adjustment", blocking: true }));
  });
});
