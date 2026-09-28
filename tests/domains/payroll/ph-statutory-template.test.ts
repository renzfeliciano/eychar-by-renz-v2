import { describe, it, expect } from "vitest";
import { PH_STATUTORY_2025 } from "@/domains/payroll/templates/ph-statutory-2025";
import { computeMonthlyContribution } from "@/domains/payroll/engine/contributions";
import { computeProgressiveBracketTax } from "@/domains/payroll/payroll-tax";

const rule = (code: string) => PH_STATUTORY_2025.contributions.find((contribution) => contribution.code === code)!;
const table = (frequency: string) => PH_STATUTORY_2025.taxTables.find((entry) => entry.payFrequency === frequency)!.brackets;

describe("PH statutory template (2025)", () => {
  it("has the SSS salary-credit table from ₱5,000 to ₱35,000 (EE 5%, ER 10%, EC ₱10/₱30)", () => {
    expect(rule("SSS").rows).toHaveLength(61);
    expect(computeMonthlyContribution(rule("SSS"), 4000)).toEqual({ employee: 250, employer: 500, extra: 10 });
    expect(computeMonthlyContribution(rule("SSS"), 14800)).toEqual({ employee: 750, employer: 1500, extra: 30 });
    expect(computeMonthlyContribution(rule("SSS"), 25000)).toEqual({ employee: 1250, employer: 2500, extra: 30 });
    expect(computeMonthlyContribution(rule("SSS"), 25249.99)).toEqual({ employee: 1250, employer: 2500, extra: 30 });
    expect(computeMonthlyContribution(rule("SSS"), 25250)).toEqual({ employee: 1275, employer: 2550, extra: 30 });
    expect(computeMonthlyContribution(rule("SSS"), 80000)).toEqual({ employee: 1750, employer: 3500, extra: 30 });
  });

  it("has PhilHealth at 5% split equally, floor ₱10,000 and ceiling ₱100,000", () => {
    expect(computeMonthlyContribution(rule("PHIC"), 9000)).toEqual({ employee: 250, employer: 250, extra: 0 });
    expect(computeMonthlyContribution(rule("PHIC"), 30000)).toEqual({ employee: 750, employer: 750, extra: 0 });
    expect(computeMonthlyContribution(rule("PHIC"), 150000)).toEqual({ employee: 2500, employer: 2500, extra: 0 });
  });

  it("has Pag-IBIG at 1%/2% for employees, 2% for employers, on up to ₱10,000", () => {
    expect(computeMonthlyContribution(rule("HDMF"), 1500)).toEqual({ employee: 15, employer: 30, extra: 0 });
    expect(computeMonthlyContribution(rule("HDMF"), 8000)).toEqual({ employee: 160, employer: 160, extra: 0 });
    expect(computeMonthlyContribution(rule("HDMF"), 30000)).toEqual({ employee: 200, employer: 200, extra: 0 });
  });

  it("has the BIR withholding tables for weekly, semi-monthly and monthly pay", () => {
    expect(PH_STATUTORY_2025.taxTables.map((entry) => entry.payFrequency)).toEqual(["weekly", "semi-monthly", "monthly"]);
    expect(computeProgressiveBracketTax(10417, table("semi-monthly"))).toBeCloseTo(0);
    expect(computeProgressiveBracketTax(20000, table("semi-monthly"))).toBeCloseTo(1604.1);
    expect(computeProgressiveBracketTax(50000, table("monthly"))).toBeCloseTo(5208.4); // 1,875 + 20% × 16,667
    expect(computeProgressiveBracketTax(10000, table("weekly"))).toBeCloseTo(894.2); // 432.60 + 20% × 2,308
  });
});
