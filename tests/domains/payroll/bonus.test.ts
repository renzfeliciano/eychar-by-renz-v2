import { describe, it, expect } from "vitest";
import { bonusAmount, monthsServedInYear, serviceMonths } from "@/domains/payroll/engine/bonus";
import { bonusBasisText } from "@/domains/payroll/bonus-labels";

const pay = { monthlyBasic: 25000, dailyRate: 1149.43 };

describe("bonusAmount", () => {
  it("pays a fixed amount", () => {
    expect(bonusAmount({ basis: "fixed", value: 5000, ...pay })).toBe(5000);
  });

  it("pays a percentage of the monthly salary", () => {
    expect(bonusAmount({ basis: "percent_of_monthly", value: 50, ...pay })).toBe(12500);
  });

  it("pays a number of months' salary", () => {
    expect(bonusAmount({ basis: "months_of_pay", value: 0.5, ...pay })).toBe(12500);
    expect(bonusAmount({ basis: "months_of_pay", value: 1, ...pay })).toBe(25000);
  });

  it("pays a number of days' pay", () => {
    expect(bonusAmount({ basis: "days_of_pay", value: 15, ...pay })).toBe(17241.45);
  });

  it("prorates by months served in the year when asked, to the centavo", () => {
    expect(bonusAmount({ basis: "fixed", value: 6000, ...pay, prorateMonths: 6 })).toBe(3000);
    expect(bonusAmount({ basis: "months_of_pay", value: 1, ...pay, prorateMonths: 4.5 })).toBe(9375);
    // A full year or more pays the whole amount.
    expect(bonusAmount({ basis: "fixed", value: 6000, ...pay, prorateMonths: 12 })).toBe(6000);
  });
});

describe("months of service", () => {
  it("counts calendar months served in the year, a mid-month start counting the rest of its month", () => {
    expect(monthsServedInYear(2026, "2020-03-01")).toBe(12);
    expect(monthsServedInYear(2026, "2026-07-01")).toBe(6);
    expect(monthsServedInYear(2026, "2026-10-16")).toBe(2.52);
    expect(monthsServedInYear(2026, "2027-01-05")).toBe(0);
  });

  it("counts whole months of service up to a date", () => {
    expect(serviceMonths("2026-06-15", "2026-12-15")).toBe(6);
    expect(serviceMonths("2026-06-16", "2026-12-15")).toBe(5);
    expect(serviceMonths("2025-01-01", "2026-12-20")).toBe(23);
  });
});

describe("bonusBasisText", () => {
  const record = { basis: "fixed", value: 5000, monthlyBasic: 30000, dailyRate: 1379.31, prorated: false, computed: 5000, overridden: false };

  it("says how each basis worked out", () => {
    expect(bonusBasisText(record)).toBe("Fixed ₱5,000.00");
    expect(bonusBasisText({ ...record, basis: "percent_of_monthly", value: 50 })).toBe("50% of ₱30,000.00 monthly salary");
    expect(bonusBasisText({ ...record, basis: "months_of_pay", value: 0.5 })).toBe("0.5 month × ₱30,000.00");
    expect(bonusBasisText({ ...record, basis: "days_of_pay", value: 15 })).toBe("15 days × ₱1,379.31");
  });

  it("adds the proration and HR's change", () => {
    expect(bonusBasisText({ ...record, prorated: true, monthsServed: 6 })).toBe("Fixed ₱5,000.00 × 6/12 months");
    expect(bonusBasisText({ ...record, overridden: true, computed: 5000 })).toBe("Fixed ₱5,000.00 · amount set by HR (worked out ₱5,000.00)");
  });
});
