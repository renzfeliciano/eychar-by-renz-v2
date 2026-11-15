import { describe, it, expect } from "vitest";
import { compensationHistory } from "@/domains/payroll/compensation-history";
import { dateKeyToDate } from "@/lib/date-key";

const row = (id: string, from: string, to: string | null, rate: number, extra: { baseRate?: number; annualIncrease?: number; reason?: string } = {}) => ({
  _id: id,
  rateType: "monthly",
  rate,
  effectiveFrom: dateKeyToDate(from),
  effectiveTo: to ? dateKeyToDate(to) : null,
  ...extra,
});

describe("compensationHistory", () => {
  it("lists every change newest first with the previous salary, revised basic, increase and effectivity date", () => {
    const history = compensationHistory([
      row("a", "2025-01-01", "2026-11-30", 25000),
      row("b", "2026-12-01", null, 40000, { baseRate: 37000, annualIncrease: 3000, reason: "Salary revision" }),
    ]);
    expect(history).toEqual([
      { id: "b", effectiveFrom: "2026-12-01", effectiveTo: null, rateType: "monthly", previousRate: 25000, baseRate: 37000, annualIncrease: 3000, rate: 40000, change: 15000, reason: "Salary revision" },
      { id: "a", effectiveFrom: "2025-01-01", effectiveTo: "2026-11-30", rateType: "monthly", previousRate: null, baseRate: 25000, annualIncrease: 0, rate: 25000, change: null, reason: null },
    ]);
  });

  it("orders by effectivity date whatever order the rows came in", () => {
    const history = compensationHistory([row("b", "2026-12-01", null, 40000), row("a", "2025-01-01", "2026-11-30", 25000)]);
    expect(history.map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(history[0].previousRate).toBe(25000);
  });
});
