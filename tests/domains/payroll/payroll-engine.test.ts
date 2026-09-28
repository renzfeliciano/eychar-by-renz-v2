import { describe, it, expect } from "vitest";
import { roundMoney } from "@/domains/payroll/engine/money";
import { computeMonthlyContribution, type ContributionRule } from "@/domains/payroll/engine/contributions";
import { isLastCutoffOfMonth, perPeriodFromMonthly } from "@/domains/payroll/engine/pay-frequency";
import { computeEmployeePay, type PayInput } from "@/domains/payroll/engine/compute-pay";
import { periodEndingOnOrBefore, nextPeriod } from "@/domains/payroll/engine/pay-periods";

// Illustrative rows only — the real template is data (templates/ph-statutory.ts).
const SSS: ContributionRule = {
  code: "SSS",
  name: "SSS",
  extraLabel: "EC",
  rows: [
    { from: 14750, to: 15249.99, employeeAmount: 750, employerAmount: 1500, extraAmount: 30 },
    { from: 34750, employeeAmount: 1750, employerAmount: 3500, extraAmount: 30 },
  ],
};
const PHILHEALTH: ContributionRule = { code: "PHIC", name: "PhilHealth", floor: 10000, ceiling: 100000, rows: [{ from: 0, employeeRate: 0.025, employerRate: 0.025 }] };
const PAGIBIG: ContributionRule = {
  code: "HDMF",
  name: "Pag-IBIG",
  ceiling: 10000,
  rows: [
    { from: 0, to: 1500, employeeRate: 0.01, employerRate: 0.02 },
    { from: 1500.01, employeeRate: 0.02, employerRate: 0.02 },
  ],
};
const SEMI_MONTHLY_TAX = [
  { minIncome: 0, maxIncome: 10417, rate: 0, baseDeduction: 0 },
  { minIncome: 10417, maxIncome: 16667, rate: 0.15, baseDeduction: 0 },
  { minIncome: 16667, maxIncome: 33333, rate: 0.2, baseDeduction: 937.5 },
  { minIncome: 33333, rate: 0.25, baseDeduction: 4270.7 },
];

function input(overrides: Partial<PayInput> = {}): PayInput {
  return {
    compensation: { rateType: "monthly", rate: 40000, allowances: [{ name: "Rice subsidy", amount: 2000, basis: "monthly", taxable: false }], minimumWageEarner: false },
    policy: { payFrequency: "semi-monthly", workDaysPerYear: 261, hoursPerDay: 8, deductLateAndUndertime: true, contributionTiming: "every_cutoff" },
    rules: { taxTable: SEMI_MONTHLY_TAX, contributions: [SSS, PHILHEALTH, PAGIBIG] },
    attendance: { scheduledDays: 11, eligibleDays: 11, daysWorked: 10, paidLeaveDays: 0, absentDays: 1, missingDays: 0, lateMinutes: 45, undertimeMinutes: 15 },
    adjustments: [],
    isLastCutoffOfMonth: false,
    ...overrides,
  };
}

describe("roundMoney", () => {
  it("rounds half away from zero to centavos, immune to binary float noise", () => {
    expect(roundMoney(114.945)).toBe(114.95);
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(-2.675)).toBe(-2.68);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
});

describe("computeMonthlyContribution", () => {
  it("reads fixed amounts off the matching salary-bracket row", () => {
    expect(computeMonthlyContribution(SSS, 15000)).toEqual({ employee: 750, employer: 1500, extra: 30 });
    expect(computeMonthlyContribution(SSS, 90000)).toEqual({ employee: 1750, employer: 3500, extra: 30 });
  });

  it("applies rates to the base clamped between floor and ceiling", () => {
    expect(computeMonthlyContribution(PHILHEALTH, 8000)).toEqual({ employee: 250, employer: 250, extra: 0 });
    expect(computeMonthlyContribution(PHILHEALTH, 40000)).toEqual({ employee: 1000, employer: 1000, extra: 0 });
    expect(computeMonthlyContribution(PHILHEALTH, 250000)).toEqual({ employee: 2500, employer: 2500, extra: 0 });
    expect(computeMonthlyContribution(PAGIBIG, 1200)).toEqual({ employee: 12, employer: 24, extra: 0 });
    expect(computeMonthlyContribution(PAGIBIG, 40000)).toEqual({ employee: 200, employer: 200, extra: 0 });
  });

  it("is zero when no row matches", () => {
    expect(computeMonthlyContribution(SSS, 1000)).toEqual({ employee: 0, employer: 0, extra: 0 });
  });
});

describe("pay frequency", () => {
  it("splits a monthly amount per pay period", () => {
    expect(perPeriodFromMonthly(40000, "monthly")).toBe(40000);
    expect(perPeriodFromMonthly(40000, "semi-monthly")).toBe(20000);
    expect(perPeriodFromMonthly(5200, "weekly")).toBeCloseTo(1200);
  });

  it("knows which cutoff closes the month", () => {
    expect(isLastCutoffOfMonth("semi-monthly", "2026-10-10")).toBe(false);
    expect(isLastCutoffOfMonth("semi-monthly", "2026-10-25")).toBe(true);
    expect(isLastCutoffOfMonth("semi-monthly", "2026-10-15")).toBe(false);
    expect(isLastCutoffOfMonth("semi-monthly", "2026-10-31")).toBe(true);
    expect(isLastCutoffOfMonth("monthly", "2026-10-31")).toBe(true);
    expect(isLastCutoffOfMonth("weekly", "2026-10-24")).toBe(false);
    expect(isLastCutoffOfMonth("weekly", "2026-10-31")).toBe(true);
  });
});

describe("computeEmployeePay", () => {
  it("pays a monthly-rated employee: basic less absences and lates, contributions, withholding tax", () => {
    const pay = computeEmployeePay(input());

    expect(pay.dailyRate).toBe(1839.08); // 40,000 × 12 ÷ 261
    expect(pay.hourlyRate).toBe(229.89);
    expect(pay.earnings).toEqual([
      { code: "basic", label: "Basic pay", amount: 20000, taxable: true },
      { code: "absences", label: "Absences (1 day)", amount: -1839.08, taxable: true },
      { code: "tardiness", label: "Tardiness & undertime (60 min)", amount: -229.89, taxable: true },
      { code: "allowance", label: "Rice subsidy", amount: 1000, taxable: false },
    ]);
    expect(pay.grossPay).toBe(18931.03);
    expect(pay.contributions).toEqual([
      { code: "SSS", name: "SSS", employee: 875, employer: 1750, extra: 15, extraLabel: "EC" },
      { code: "PHIC", name: "PhilHealth", employee: 500, employer: 500, extra: 0, extraLabel: undefined },
      { code: "HDMF", name: "Pag-IBIG", employee: 100, employer: 100, extra: 0, extraLabel: undefined },
    ]);
    // Taxable: 20,000 − 1,839.08 − 229.89 − 1,475 contributions (the rice subsidy isn't taxable).
    expect(pay.taxableIncome).toBe(16456.03);
    expect(pay.tax).toBe(905.85); // 15% of the excess over 10,417
    expect(pay.netPay).toBe(16550.18); // 18,931.03 − 1,475 − 905.85
    expect(pay.warnings).toEqual([]);
  });

  it("pays a daily-rated minimum wage earner for days worked, with no withholding tax", () => {
    const pay = computeEmployeePay(
      input({
        compensation: { rateType: "daily", rate: 700, allowances: [{ name: "Meal", amount: 50, basis: "daily", taxable: false }], minimumWageEarner: true },
        attendance: { scheduledDays: 13, eligibleDays: 13, daysWorked: 10, paidLeaveDays: 1, absentDays: 2, missingDays: 0, lateMinutes: 0, undertimeMinutes: 0 },
      }),
    );

    expect(pay.monthlyBasic).toBe(15225); // 700 × 261 ÷ 12, the contribution base
    expect(pay.earnings).toEqual([
      { code: "basic", label: "Basic pay (11 days × 700.00)", amount: 7700, taxable: true },
      { code: "allowance", label: "Meal (10 days)", amount: 500, taxable: false },
    ]);
    expect(pay.contributions.map((line) => line.employee)).toEqual([375, 190.31, 100]);
    expect(pay.tax).toBe(0);
    expect(pay.netPay).toBe(7534.69);
  });

  it("deducts the whole month's contributions on the last cutoff only, when the policy says so", () => {
    const policy = { ...input().policy, contributionTiming: "last_cutoff_of_month" as const };
    expect(computeEmployeePay(input({ policy })).contributions.every((line) => line.employee === 0)).toBe(true);
    const last = computeEmployeePay(input({ policy, isLastCutoffOfMonth: true }));
    expect(last.contributions.map((line) => line.employee)).toEqual([1750, 1000, 200]);
  });

  it("prorates a monthly-rated employee who joined or left mid-period", () => {
    const pay = computeEmployeePay(
      input({ attendance: { scheduledDays: 11, eligibleDays: 5, daysWorked: 5, paidLeaveDays: 0, absentDays: 0, missingDays: 0, lateMinutes: 0, undertimeMinutes: 0 } }),
    );
    expect(pay.earnings[0]).toEqual({ code: "basic", label: "Basic pay (5 of 11 days)", amount: 9195.4, taxable: true });
    expect(pay.earnings.find((line) => line.code === "allowance")?.amount).toBe(454.55); // 1,000 × 5/11
  });

  it("adds taxable and non-taxable earnings, and takes deductions after tax", () => {
    const pay = computeEmployeePay(
      input({
        adjustments: [
          { category: "overtime", label: "Overtime", direction: "earning", amount: 1000, taxable: true },
          { category: "thirteenth_month", label: "13th month (partial)", direction: "earning", amount: 3000, taxable: false },
          { category: "sss_loan", label: "SSS loan", direction: "deduction", amount: 500, taxable: false },
        ],
      }),
    );

    expect(pay.taxableIncome).toBe(17456.03);
    expect(pay.tax).toBe(1095.31); // 937.50 + 20% of the excess over 16,667
    expect(pay.deductions).toEqual([{ code: "sss_loan", label: "SSS loan", amount: 500 }]);
    expect(pay.grossPay).toBe(22931.03);
    expect(pay.netPay).toBe(19860.72); // 22,931.03 − 1,475 − 1,095.31 − 500
  });

  it("flags rest-day work for an adjustment instead of guessing the premium", () => {
    const pay = computeEmployeePay(
      input({
        compensation: { rateType: "daily", rate: 700, allowances: [], minimumWageEarner: true },
        attendance: { scheduledDays: 11, eligibleDays: 11, daysWorked: 11, paidLeaveDays: 0, absentDays: 0, missingDays: 0, restDaysWorked: 1, lateMinutes: 0, undertimeMinutes: 0 },
      }),
    );
    expect(pay.earnings[0].amount).toBe(7700);
    expect(pay.warnings).toEqual([
      { code: "rest_day_work", message: "Worked 1 rest day. Add rest day pay as an adjustment (130% of the daily rate is ₱910.00 a day).", blocking: false },
    ]);
  });

  it("flags missing attendance, and blocks a negative net pay", () => {
    const pay = computeEmployeePay(
      input({
        attendance: { scheduledDays: 11, eligibleDays: 11, daysWorked: 8, paidLeaveDays: 0, absentDays: 0, missingDays: 3, lateMinutes: 0, undertimeMinutes: 0 },
        adjustments: [{ category: "cash_advance", label: "Cash advance", direction: "deduction", amount: 50000, taxable: false }],
      }),
    );
    expect(pay.warnings).toEqual([
      { code: "missing_attendance", message: "3 scheduled workdays have no attendance record; paid as worked.", blocking: false },
      { code: "negative_net_pay", message: "Net pay is negative. Reduce the deductions before submitting.", blocking: true },
    ]);
  });
});

describe("pay periods", () => {
  const semi = (cutoffDay: number) => ({ payFrequency: "semi-monthly" as const, cutoffDay, payDateOffsetDays: 5 });

  it("finds the latest closed semi-monthly cutoff (26–10 and 11–25)", () => {
    expect(periodEndingOnOrBefore(semi(10), "2026-10-12")).toEqual({ start: "2026-09-26", end: "2026-10-10", payDate: "2026-10-15" });
    expect(periodEndingOnOrBefore(semi(10), "2026-10-25")).toEqual({ start: "2026-10-11", end: "2026-10-25", payDate: "2026-10-30" });
  });

  it("handles 1–15 / 16–end of month, including February", () => {
    expect(periodEndingOnOrBefore(semi(15), "2026-03-01")).toEqual({ start: "2026-02-16", end: "2026-02-28", payDate: "2026-03-05" });
    expect(periodEndingOnOrBefore(semi(15), "2026-03-15")).toEqual({ start: "2026-03-01", end: "2026-03-15", payDate: "2026-03-20" });
  });

  it("handles monthly and weekly schedules, and steps to the next period", () => {
    expect(periodEndingOnOrBefore({ payFrequency: "monthly", cutoffDay: 31, payDateOffsetDays: 0 }, "2026-03-15")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
      payDate: "2026-02-28",
    });
    // Weeks ending Saturday; 2026-09-28 is a Monday.
    const weekly = { payFrequency: "weekly" as const, cutoffDay: 6, payDateOffsetDays: 6 };
    const period = periodEndingOnOrBefore(weekly, "2026-09-28");
    expect(period).toEqual({ start: "2026-09-20", end: "2026-09-26", payDate: "2026-10-02" });
    expect(nextPeriod(weekly, period)).toEqual({ start: "2026-09-27", end: "2026-10-03", payDate: "2026-10-09" });
    expect(nextPeriod(semi(10), { start: "2026-10-11", end: "2026-10-25", payDate: "2026-10-30" })).toEqual({
      start: "2026-10-26",
      end: "2026-11-10",
      payDate: "2026-11-15",
    });
  });
});
