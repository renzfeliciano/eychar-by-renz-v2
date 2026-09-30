import { describe, it, expect } from "vitest";
import { computeSettlement, countWorkdays, type SettlementInputs } from "@/domains/final-settlement/settlement-calculator";

const BASE: SettlementInputs = {
  lastWorkingDay: "2026-10-16",
  lastPaidThrough: "2026-10-10",
  rateType: "monthly",
  rate: 26_100,
  workDaysPerYear: 261,
  workWeekDays: [1, 2, 3, 4, 5],
  basicEarnedThisYear: 234_900,
  thirteenthMonthPaidThisYear: 0,
  convertibleLeave: [{ leaveTypeName: "Vacation Leave", days: 5 }],
  accountabilities: [{ itemId: "i1", label: "Return all issued company assets: laptop screen damaged", amount: 8500 }],
  manualLines: [{ id: "m1", direction: "earning", label: "Performance bonus", amount: 5000, reason: "Q3 bonus approved 2026-09-30" }],
};

describe("countWorkdays", () => {
  it("counts only the policy's workdays, both ends included", () => {
    expect(countWorkdays("2026-10-11", "2026-10-16", [1, 2, 3, 4, 5])).toBe(5); // Sun 11 → Fri 16
    expect(countWorkdays("2026-10-17", "2026-10-16", [1, 2, 3, 4, 5])).toBe(0);
  });
});

describe("computeSettlement", () => {
  it("builds every line with its source and basis, and totals them", () => {
    const result = computeSettlement(BASE);

    // 26,100 × 12 ÷ 261 = 1,200 a day.
    expect(result.dailyRate).toBe(1200);
    expect(result.lines).toEqual([
      expect.objectContaining({ code: "salary_balance", direction: "earning", amount: 6000, source: "Attendance & pay terms", basis: "5 workdays (Oct 11–16, 2026) × ₱1,200.00 daily rate" }),
      expect.objectContaining({ code: "leave_encashment", direction: "earning", amount: 6000, label: "Leave encashment: Vacation Leave", basis: "5 days × ₱1,200.00" }),
      expect.objectContaining({ code: "thirteenth_month", direction: "earning", amount: 20075, basis: "(₱234,900.00 earned + ₱6,000.00 salary balance) ÷ 12 − ₱0.00 already paid" }),
      expect.objectContaining({ code: "manual", direction: "earning", amount: 5000, label: "Performance bonus", manualLineId: "m1" }),
      expect.objectContaining({ code: "accountability", direction: "deduction", amount: 8500, clearanceItemId: "i1" }),
    ]);
    expect(result.totals).toEqual({ earnings: 37075, deductions: 8500, net: 28575 });
  });

  it("starts the salary balance at the first of the month when nothing was paid yet, and skips empty lines", () => {
    const result = computeSettlement({ ...BASE, lastPaidThrough: null, convertibleLeave: [], accountabilities: [], manualLines: [], lastWorkingDay: "2026-10-02" });
    expect(result.lines.find((line) => line.code === "salary_balance")).toMatchObject({ amount: 2400 }); // Oct 1–2
    expect(result.lines.some((line) => line.code === "leave_encashment")).toBe(false);
  });

  it("never pays a negative 13th month, and reports a balance due when deductions exceed earnings", () => {
    const result = computeSettlement({
      ...BASE,
      lastPaidThrough: "2026-10-16",
      thirteenthMonthPaidThisYear: 50_000,
      convertibleLeave: [],
      manualLines: [],
      accountabilities: [{ itemId: "i1", label: "Unreturned laptop", amount: 60_000 }],
    });
    expect(result.lines.some((line) => line.code === "thirteenth_month")).toBe(false);
    expect(result.totals.net).toBe(-60_000);
  });

  it("uses the daily rate as-is for daily-rated staff", () => {
    expect(computeSettlement({ ...BASE, rateType: "daily", rate: 695 }).dailyRate).toBe(695);
  });
});
