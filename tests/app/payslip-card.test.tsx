// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PayslipCard, type PayslipRecord } from "@/app/(app)/payroll/[id]/payslips/payslip-card";

// Payroll plan Phase 7: payslips show every line with its taxable flag, and what a 13th-month, year-end or
// final run's figures came from (payroll pages had no UI tests before this).

const base: PayslipRecord = {
  _id: "r1",
  employeeName: "Ana Santos",
  employeeNumber: "EMP-1",
  rate: 30000,
  rateType: "monthly",
  earnings: [
    { label: "Basic pay", amount: 15000, taxable: true },
    { label: "Rice allowance", amount: 1000, taxable: false },
  ],
  contributions: [{ name: "SSS", employee: 750 }],
  deductions: [{ label: "Cash advance", amount: 500 }],
  grossPay: 16000,
  taxableIncome: 14250,
  tax: 600,
  totalDeductions: 1850,
  netPay: 14150,
  employerContributions: 1530,
  attendance: { daysWorked: 11, absentDays: 0, paidLeaveDays: 0, lateMinutes: 0, undertimeMinutes: 0 },
};

const show = (record: Partial<PayslipRecord>, isFinal = true) =>
  render(<PayslipCard record={{ ...base, ...record }} organizationName="Acme Builders" runLabel="PR-2026-0001" periodLabel="Nov 1–15, 2026" payDateLabel="Nov 20, 2026" isFinal={isFinal} projectName={null} />);

describe("PayslipCard", () => {
  it("marks non-taxable earnings and states taxable income", () => {
    show({});
    expect(screen.getByText("Rice allowance").parentElement).toHaveTextContent("non-taxable");
    expect(screen.getByText("Basic pay").parentElement).not.toHaveTextContent("non-taxable");
    expect(screen.getByText(/^Taxable income/)).toHaveTextContent("14,250.00");
    expect(screen.getByText(/Days worked 11/)).toBeTruthy();
  });

  it("flags a draft as not final", () => {
    show({}, false);
    expect(screen.getByText("Draft: not final")).toBeTruthy();
  });

  it("explains a year-end record: tax due, withheld and the refund", () => {
    show({ earnings: [{ label: "Tax refund 2026 (year-end)", amount: 233.56, taxable: false }], yearEnd: { year: 2026, grossTaxable: 330600, taxDue: 12090, withheld: 12323.56, difference: -233.56 } });
    expect(screen.getByText(/Year-end 2026/)).toHaveTextContent(/tax due ₱?12,090\.00.*refund ₱?233\.56/);
    expect(screen.getByText("Tax refund 2026 (year-end)").parentElement).toHaveTextContent("non-taxable");
  });

  it("names the settlement a final run pays", () => {
    show({ finalSettlement: { version: 3, hash: "abcdef0123456789", lastWorkingDay: "2026-10-31" } });
    const footer = screen.getByText(/Final pay · last working day/);
    expect(footer).toHaveTextContent("settlement version 3");
    expect(footer).toHaveTextContent("abcdef0123");
    expect(within(footer).queryByText(/Days worked/)).toBeNull();
  });

  it("explains a 13th-month record from basic earned ÷ divisor", () => {
    show({ earnings: [{ label: "13th month pay (2026)", amount: 30000, taxable: false }], thirteenthMonth: { basicEarned: 360000, estimatedBasic: 0, divisor: 12, alreadyPaid: 0 } });
    expect(screen.getByText(/Basic earned/)).toHaveTextContent("÷ 12");
  });
});
