import { describe, it, expect } from "vitest";
import { blendPayTerms, dayBefore, scheduledDaysInRange } from "@/domains/payroll/engine/rate-segments";
import type { PayCompensation } from "@/domains/payroll/engine/compute-pay";
import { dateKeysBetween } from "@/lib/date-key";

const monthly = (rate: number, allowances: PayCompensation["allowances"] = []): PayCompensation => ({ rateType: "monthly", rate, allowances, minimumWageEarner: false });
const daily = (rate: number, allowances: PayCompensation["allowances"] = []): PayCompensation => ({ rateType: "daily", rate, allowances, minimumWageEarner: false });

describe("scheduledDaysInRange", () => {
  const period = dateKeysBetween("2026-11-01", "2026-11-30");

  it("counts every day in the range when every day is a workday", () => {
    const all = [0, 1, 2, 3, 4, 5, 6];
    expect(scheduledDaysInRange(period, all, "2026-11-01", "2026-11-10")).toBe(10);
    expect(scheduledDaysInRange(period, all, "2026-11-11", "2026-11-30")).toBe(20);
  });

  it("counts only the policy's work week", () => {
    const weekdays = [1, 2, 3, 4, 5];
    const first = scheduledDaysInRange(period, weekdays, "2026-11-01", "2026-11-15");
    const second = scheduledDaysInRange(period, weekdays, "2026-11-16", "2026-11-30");
    expect(first + second).toBe(period.filter((day) => weekdays.includes(new Date(`${day}T00:00:00Z`).getUTCDay())).length);
  });

  it("gives back a day before a date key", () => {
    expect(dayBefore("2026-11-01")).toBe("2026-10-31");
  });
});

describe("blendPayTerms", () => {
  it("returns a single segment unchanged", () => {
    const terms = monthly(30000, [{ name: "Transport", amount: 2000, basis: "monthly", taxable: false }]);
    expect(blendPayTerms([{ terms, scheduledDays: 20 }], 260)).toEqual(terms);
  });

  it("blends two monthly rates by scheduled workdays", () => {
    const blended = blendPayTerms(
      [
        { terms: monthly(30000), scheduledDays: 10 },
        { terms: monthly(40000), scheduledDays: 10 },
      ],
      260,
    );
    expect(blended.rateType).toBe("monthly");
    expect(blended.rate).toBeCloseTo(35000, 6);
  });

  it("weights unequal segments by their workdays", () => {
    const blended = blendPayTerms(
      [
        { terms: monthly(30000), scheduledDays: 15 },
        { terms: monthly(40000), scheduledDays: 5 },
      ],
      260,
    );
    expect(blended.rate).toBeCloseTo(32500, 6);
  });

  it("blends a monthly rate with a daily rate and takes the last segment's rate type", () => {
    // 26,000 a month and ₱1,000 a day at 260 work days a year (21,666.67 a month equivalent).
    const blended = blendPayTerms(
      [
        { terms: monthly(26000), scheduledDays: 10 },
        { terms: daily(1000), scheduledDays: 10 },
      ],
      260,
    );
    expect(blended.rateType).toBe("daily");
    expect(blended.rate).toBeCloseTo(1100, 2);
  });

  it("blends allowances by name, keeping the basis and tax treatment of the latest segment", () => {
    const blended = blendPayTerms(
      [
        { terms: monthly(30000, [{ name: "Transport", amount: 2000, basis: "monthly", taxable: false }, { name: "Meal", amount: 100, basis: "daily", taxable: false }]), scheduledDays: 10 },
        { terms: monthly(30000, [{ name: "Transport", amount: 3000, basis: "monthly", taxable: true }]), scheduledDays: 10 },
      ],
      260,
    );
    const transport = blended.allowances.find((allowance) => allowance.name === "Transport")!;
    expect(transport.amount).toBeCloseTo(2500, 6);
    expect(transport.taxable).toBe(true);
    // Meal is only in the first segment: half of 100 a day (2,166.67 a month) weighted, back to a daily amount of 50.
    const meal = blended.allowances.find((allowance) => allowance.name === "Meal")!;
    expect(meal.basis).toBe("daily");
    expect(meal.amount).toBeCloseTo(50, 6);
  });

  it("splits evenly when no segment has scheduled workdays", () => {
    const blended = blendPayTerms(
      [
        { terms: monthly(30000), scheduledDays: 0 },
        { terms: monthly(40000), scheduledDays: 0 },
      ],
      260,
    );
    expect(blended.rate).toBeCloseTo(35000, 6);
  });

  it("carries the minimum-wage flag from the latest segment", () => {
    const blended = blendPayTerms(
      [
        { terms: { ...monthly(30000), minimumWageEarner: true }, scheduledDays: 10 },
        { terms: { ...monthly(40000), minimumWageEarner: false }, scheduledDays: 10 },
      ],
      260,
    );
    expect(blended.minimumWageEarner).toBe(false);
  });
});
