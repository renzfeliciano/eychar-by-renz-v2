import { describe, it, expect } from "vitest";
import { basicEarnedFrom, estimateRemainingBasic, thirteenthMonthAmount, type RemainderInput } from "@/domains/payroll/engine/thirteenth-month";

/**
 * The Gate B examples (knowledge/plans/payroll-phase-3-13th-month.md), approved 2026-11-14.
 * Monthly policy: 261 workdays a year, 8 hours a day, divisor 12.
 */
describe("13th month (PD 851)", () => {
  it("A: full year at 30,000/month, two absences and an hour late; overtime and allowance left out → 29,755.75", () => {
    const year = [
      ...Array.from({ length: 12 }, () => ({ code: "basic", amount: 30000 })),
      { code: "absences", amount: -2758.62 },
      { code: "tardiness", amount: -172.41 },
      { code: "overtime", amount: 5000 },
      ...Array.from({ length: 12 }, () => ({ code: "allowance", amount: 1500 })),
    ];
    const basicEarned = basicEarnedFrom(year);
    expect(basicEarned).toBe(357068.97);
    expect(thirteenthMonthAmount({ basicEarned, divisor: 12, alreadyPaid: 0 })).toBe(29755.75);
  });

  it("B: hired Aug 17 at 24,000, raised to 26,000 on Nov 1 → 9,344.83", () => {
    const year = [{ code: "basic", amount: 12137.95 }, { code: "basic", amount: 24000 }, { code: "basic", amount: 24000 }, { code: "basic", amount: 26000 }, { code: "basic", amount: 26000 }];
    const basicEarned = basicEarnedFrom(year);
    expect(basicEarned).toBe(112137.95);
    expect(thirteenthMonthAmount({ basicEarned, divisor: 12, alreadyPaid: 0 })).toBe(9344.83);
  });

  it("C: daily-rated 650, 126 days paid to a June 30 resignation → 6,825.00, and nothing more once paid", () => {
    const basicEarned = basicEarnedFrom([{ code: "basic", amount: 81900 }]);
    expect(thirteenthMonthAmount({ basicEarned, divisor: 12, alreadyPaid: 0 })).toBe(6825);
    expect(thirteenthMonthAmount({ basicEarned, divisor: 12, alreadyPaid: 6825 })).toBe(0);
    expect(thirteenthMonthAmount({ basicEarned, divisor: 12, alreadyPaid: 7000 })).toBe(0);
  });

  it("adds the December estimate to the base", () => {
    expect(thirteenthMonthAmount({ basicEarned: 345000, estimatedBasic: 15000, divisor: 12, alreadyPaid: 0 })).toBe(30000);
  });

  describe("December estimate", () => {
    const base: RemainderInput = { rateType: "monthly", rate: 30000, payFrequency: "semi-monthly", workDaysPerYear: 261, workWeekDays: [1, 2, 3, 4, 5], from: "2026-12-16", to: "2026-12-31", isEmployed: () => true };

    it("is half the salary for an unpaid 16th–31st semi-monthly cutoff, and the whole month for an unpaid December", () => {
      expect(estimateRemainingBasic(base)).toBe(15000);
      expect(estimateRemainingBasic({ ...base, from: "2026-12-01" })).toBe(30000);
      expect(estimateRemainingBasic({ ...base, payFrequency: "monthly", from: "2026-12-01" })).toBe(30000);
    });

    it("pro-rates by calendar days when employment ends inside the period", () => {
      // Employed Dec 16–23: 8 of the cutoff's 16 days → a quarter of the salary.
      expect(estimateRemainingBasic({ ...base, isEmployed: (day) => day <= "2026-12-23" })).toBe(7500);
    });

    it("pays daily-rated staff for scheduled workdays", () => {
      // Dec 16–31, 2026: 12 weekdays.
      expect(estimateRemainingBasic({ ...base, rateType: "daily", rate: 650 })).toBe(7800);
    });

    it("is nothing when the year is already paid", () => {
      expect(estimateRemainingBasic({ ...base, from: "2027-01-01" })).toBe(0);
    });

    it("pro-rates a short last week on a weekly policy", () => {
      // Dec 28–31: 4 of a 7-day week at 30,000 × 12 ÷ 52 a week.
      expect(estimateRemainingBasic({ ...base, payFrequency: "weekly", from: "2026-12-28" })).toBe(Math.round(((30000 * 12) / 52) * (4 / 7) * 100) / 100);
    });
  });
});
