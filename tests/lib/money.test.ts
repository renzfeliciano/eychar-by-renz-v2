import { describe, it, expect } from "vitest";
import { formatAmount, formatMoney, roundMoney } from "@/lib/money";
import { formatPeso } from "@/domains/payroll/payroll-labels";

describe("formatMoney", () => {
  it("formats pesos with two decimals and thousands separators", () => {
    expect(formatMoney(1234.5)).toBe("₱1,234.50");
    expect(formatMoney(0)).toBe("₱0.00");
    expect(formatMoney(1_000_000)).toBe("₱1,000,000.00");
  });

  it("puts the sign before the symbol for negatives", () => {
    expect(formatMoney(-1234.5)).toBe("-₱1,234.50");
  });

  it("rounds half away from zero to the centavo, like the payroll engine", () => {
    expect(formatMoney(114.945)).toBe("₱114.95");
    expect(formatMoney(-114.945)).toBe("-₱114.95");
    expect(formatMoney(1.005)).toBe("₱1.01");
    expect(formatMoney(2.344)).toBe("₱2.34");
    expect(roundMoney(114.945)).toBe(114.95);
  });

  it("never prints a negative zero", () => {
    expect(formatMoney(-0)).toBe("₱0.00");
    expect(formatMoney(-0.004)).toBe("₱0.00");
    expect(formatAmount(-0.001)).toBe("0.00");
  });

  it("treats a non-number as zero instead of printing NaN", () => {
    expect(formatMoney(Number.NaN)).toBe("₱0.00");
  });

  it("formats an amount without the symbol the same way", () => {
    expect(formatAmount(1234.5)).toBe("1,234.50");
    expect(formatAmount(-1234.5)).toBe("-1,234.50");
  });

  it("is the formatter payroll's formatPeso uses", () => {
    expect(formatPeso).toBe(formatMoney);
  });
});
