import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import { computeEmployeePay, type PayInput } from "@/domains/payroll/engine/compute-pay";
import { PAY_PREMIUM_DEFAULTS, formatMultiplierPercent, payPremiumsOf } from "@/domains/payroll/engine/premiums";
import { PayrollPolicyService } from "@/domains/payroll/payroll-policy-service";
import { PayrollPolicyModel } from "@/server/db/models";
import { createPayrollPolicySchema } from "@/shared/validation/payroll";
import { computeSettlement, type SettlementInputs } from "@/domains/final-settlement/settlement-calculator";

// Premiums are payroll policy data (AGENTS.md §2, §28): defaults equal the
// values that used to be hardcoded, and a policy's own values change results.

function restDayInput(policy: Partial<PayInput["policy"]> = {}): PayInput {
  return {
    compensation: { rateType: "daily", rate: 700, allowances: [], minimumWageEarner: true },
    policy: { payFrequency: "semi-monthly", workDaysPerYear: 261, hoursPerDay: 8, deductLateAndUndertime: true, contributionTiming: "every_cutoff", ...policy },
    rules: { taxTable: [], contributions: [] },
    attendance: { scheduledDays: 11, eligibleDays: 11, daysWorked: 11, paidLeaveDays: 0, absentDays: 0, missingDays: 0, restDaysWorked: 1, lateMinutes: 0, undertimeMinutes: 0 },
    adjustments: [],
    isLastCutoffOfMonth: false,
  };
}

describe("pay premium defaults", () => {
  it("match the values that used to be hardcoded", () => {
    expect(PAY_PREMIUM_DEFAULTS).toEqual({ overtimeMultiplier: 1.25, restDayMultiplier: 1.3, thirteenthMonthDivisor: 12 });
    expect(payPremiumsOf(undefined)).toEqual(PAY_PREMIUM_DEFAULTS);
    expect(payPremiumsOf({ overtimeMultiplier: null })).toEqual(PAY_PREMIUM_DEFAULTS);
    expect(payPremiumsOf({ overtimeMultiplier: 1.5 }).overtimeMultiplier).toBe(1.5);
  });

  it("reads multiples as percentages", () => {
    expect(formatMultiplierPercent(1.25)).toBe("125%");
    expect(formatMultiplierPercent(1.3)).toBe("130%");
    expect(formatMultiplierPercent(2.6)).toBe("260%");
  });

  it("validation defaults new policies to them and accepts a policy's own", () => {
    const base = { organizationId: new Types.ObjectId().toString(), name: "Standard", payFrequency: "semi-monthly" };
    expect(createPayrollPolicySchema.parse(base)).toMatchObject(PAY_PREMIUM_DEFAULTS);
    expect(createPayrollPolicySchema.parse({ ...base, overtimeMultiplier: "1.5", restDayMultiplier: 1.5, thirteenthMonthDivisor: 10 })).toMatchObject({
      overtimeMultiplier: 1.5,
      restDayMultiplier: 1.5,
      thirteenthMonthDivisor: 10,
    });
    expect(createPayrollPolicySchema.safeParse({ ...base, overtimeMultiplier: 0.9 }).success).toBe(false);
    expect(createPayrollPolicySchema.safeParse({ ...base, thirteenthMonthDivisor: 0 }).success).toBe(false);
  });
});

describe("rest day hint", () => {
  it("uses the default 130% when the policy doesn't set one", () => {
    expect(computeEmployeePay(restDayInput()).warnings[0].message).toBe("Worked 1 rest day. Add rest day pay as an adjustment (130% of the daily rate is ₱910.00 a day).");
  });

  it("uses the policy's own rest day premium", () => {
    expect(computeEmployeePay(restDayInput({ restDayMultiplier: 1.5 })).warnings[0].message).toBe(
      "Worked 1 rest day. Add rest day pay as an adjustment (150% of the daily rate is ₱1,050.00 a day).",
    );
  });
});

describe("13th month divisor", () => {
  const BASE: SettlementInputs = {
    lastWorkingDay: "2026-10-16",
    lastPaidThrough: "2026-10-10",
    rateType: "monthly",
    rate: 26_100,
    workDaysPerYear: 261,
    workWeekDays: [1, 2, 3, 4, 5],
    basicEarnedThisYear: 234_900,
    thirteenthMonthPaidThisYear: 0,
    convertibleLeave: [],
    accountabilities: [],
    manualLines: [],
  };
  const thirteenth = (inputs: SettlementInputs) => computeSettlement(inputs).lines.find((line) => line.code === "thirteenth_month");

  it("divides by 12 by default", () => {
    expect(thirteenth(BASE)).toMatchObject({ amount: 20075, basis: "(₱234,900.00 earned + ₱6,000.00 salary balance) ÷ 12 − ₱0.00 already paid" });
    expect(thirteenth({ ...BASE, thirteenthMonthDivisor: 12 })?.amount).toBe(20075);
  });

  it("uses the policy's divisor", () => {
    // (234,900 + 6,000) ÷ 10 = 24,090
    expect(thirteenth({ ...BASE, thirteenthMonthDivisor: 10 })).toMatchObject({ amount: 24090, basis: "(₱234,900.00 earned + ₱6,000.00 salary balance) ÷ 10 − ₱0.00 already paid" });
  });
});

describe("PayrollPolicyService premiums", () => {
  const base = () => ({
    organizationId: new Types.ObjectId().toString(),
    name: "Standard",
    payFrequency: "semi-monthly" as const,
    workDaysPerYear: 261,
    hoursPerDay: 8,
    finalPayDeadlineDays: 30,
    workWeekDays: [1, 2, 3, 4, 5],
    deductLateAndUndertime: true,
    contributionTiming: "every_cutoff" as const,
  });

  it("stores the defaults when a caller doesn't give premiums", async () => {
    const policy = await PayrollPolicyService.create(base(), {});
    const stored = await PayrollPolicyModel.findById(policy._id).lean();
    expect(stored).toMatchObject(PAY_PREMIUM_DEFAULTS);
  });

  it("stores a policy's own premiums", async () => {
    const policy = await PayrollPolicyService.create({ ...base(), overtimeMultiplier: 1.5, restDayMultiplier: 2, thirteenthMonthDivisor: 10 }, {});
    const stored = await PayrollPolicyModel.findById(policy._id).lean();
    expect(stored).toMatchObject({ overtimeMultiplier: 1.5, restDayMultiplier: 2, thirteenthMonthDivisor: 10 });
  });

  it("reads a policy saved before the premiums existed as the defaults", async () => {
    const policy = await PayrollPolicyService.create(base(), {});
    await PayrollPolicyModel.collection.updateOne({ _id: policy._id }, { $unset: { overtimeMultiplier: "", restDayMultiplier: "", thirteenthMonthDivisor: "" } });
    const legacy = await PayrollPolicyModel.findById(policy._id).lean();
    expect(legacy).not.toHaveProperty("overtimeMultiplier");
    expect(payPremiumsOf(legacy)).toEqual(PAY_PREMIUM_DEFAULTS);
  });
});
