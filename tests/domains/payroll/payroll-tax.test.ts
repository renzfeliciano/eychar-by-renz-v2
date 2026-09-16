import { describe, it, expect } from "vitest";
import { computeProgressiveBracketTax } from "@/domains/payroll/payroll-tax";

const BRACKETS = [
  { minIncome: 0, maxIncome: 20000, rate: 0, baseDeduction: 0 },
  { minIncome: 20000, maxIncome: 33333, rate: 0.15, baseDeduction: 0 },
  { minIncome: 33333, maxIncome: undefined, rate: 0.2, baseDeduction: 2000 },
];

describe("computeProgressiveBracketTax", () => {
  it("returns 0 for income at or below the lowest bracket's minimum", () => {
    expect(computeProgressiveBracketTax(0, BRACKETS)).toBe(0);
    expect(computeProgressiveBracketTax(15000, BRACKETS)).toBe(0);
  });

  it("applies the matching bracket's rate and base deduction", () => {
    expect(computeProgressiveBracketTax(25000, BRACKETS)).toBeCloseTo(0.15 * (25000 - 20000));
  });

  it("applies the open-ended top bracket when maxIncome is unset", () => {
    expect(computeProgressiveBracketTax(50000, BRACKETS)).toBeCloseTo(2000 + 0.2 * (50000 - 33333));
  });

  it("returns 0 when no brackets are configured", () => {
    expect(computeProgressiveBracketTax(50000, [])).toBe(0);
  });

  it("returns 0 for non-positive income", () => {
    expect(computeProgressiveBracketTax(-100, BRACKETS)).toBe(0);
  });
});
