import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildRegisterCsv, buildRegisterWorkbook, type RegisterInput } from "@/domains/payroll/payroll-register-export";

const contribution = (code: string, name: string, employee: number, employer: number, extra = 0) => ({ code, name, employee, employer, extra, extraLabel: extra ? "EC" : undefined });

const INPUT: RegisterInput = {
  organizationName: "Acme Builders",
  runNumber: "PR-2026-0001",
  scopeLabel: "EGI Rufino",
  periodLabel: "Oct 1–15, 2026",
  payDateLabel: "Oct 20, 2026",
  statusLabel: "Approved",
  records: [
    {
      employeeNumber: "EMP-1",
      employeeName: "Angela Santos",
      rateType: "monthly",
      rate: 30000,
      attendance: { daysWorked: 10, absentDays: 1, lateMinutes: 30, undertimeMinutes: 0 },
      earnings: [
        { code: "basic", label: "Basic pay", amount: 15000, taxable: true },
        { code: "absences", label: "Absences (1 day)", amount: -1379.31, taxable: true },
        { code: "allowance", label: "Rice", amount: 1000, taxable: false },
        { code: "overtime", label: "Overtime", amount: 500, taxable: true },
      ],
      contributions: [contribution("SSS", "SSS", 750, 1500, 15), contribution("PHIC", "PhilHealth", 375, 375), contribution("HDMF", "Pag-IBIG", 100, 100)],
      deductions: [{ code: "cash_advance", label: "Cash advance", amount: 1000 }],
      grossPay: 15120.69,
      tax: 296.8,
      netPay: 12598.89,
    },
    {
      employeeNumber: "EMP-2",
      employeeName: "Carlos Santos",
      rateType: "daily",
      rate: 700,
      attendance: { daysWorked: 10, absentDays: 0, lateMinutes: 0, undertimeMinutes: 0 },
      earnings: [{ code: "basic", label: "Basic pay (10 days × 700.00)", amount: 7000, taxable: true }],
      contributions: [contribution("SSS", "SSS", 375, 750, 15), contribution("PHIC", "PhilHealth", 190.31, 190.31), contribution("HDMF", "Pag-IBIG", 100, 100)],
      deductions: [],
      grossPay: 7000,
      tax: 0,
      netPay: 6334.69,
    },
  ],
};

describe("payroll register export", () => {
  it("lays out one row per employee with a column per contribution and a totals row", async () => {
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(await buildRegisterWorkbook(INPUT).xlsx.writeBuffer());
    const sheet = loaded.getWorksheet("Register")!;

    expect(sheet.getCell("A1").value).toBe("Acme Builders: payroll register PR-2026-0001");
    expect(sheet.getCell("A2").value).toBe("EGI Rufino · Oct 1–15, 2026 · pay date Oct 20, 2026 · Approved");
    expect(sheet.getRow(4).values).toEqual([
      undefined, "#", "Employee #", "Employee", "Rate type", "Rate", "Days worked", "Absences", "Late/undertime (min)",
      "Basic pay", "Allowances", "Other earnings", "Gross pay", "SSS", "PhilHealth", "Pag-IBIG", "Withholding tax", "Other deductions", "Net pay",
    ]);
    // Basic pay is net of absences and tardiness.
    expect(sheet.getRow(5).values).toEqual([undefined, 1, "EMP-1", "Angela Santos", "Monthly", 30000, 10, 1, 30, 13620.69, 1000, 500, 15120.69, 750, 375, 100, 296.8, 1000, 12598.89]);
    const totals = sheet.getRow(7).values as unknown[];
    expect(totals[3]).toBe("Total (2 employees)");
    expect(totals[12]).toBe(22120.69);
    expect(totals[18]).toBe(18933.58);
  });

  it("adds a contributions sheet with employee, employer and EC shares for remittance", async () => {
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(await buildRegisterWorkbook(INPUT).xlsx.writeBuffer());
    const sheet = loaded.getWorksheet("Contributions")!;

    expect(sheet.getRow(4).values).toEqual([
      undefined, "#", "Employee #", "Employee", "SSS (EE)", "SSS (ER)", "SSS (EC)", "PhilHealth (EE)", "PhilHealth (ER)", "Pag-IBIG (EE)", "Pag-IBIG (ER)", "Total remittance",
    ]);
    expect(sheet.getRow(5).values).toEqual([undefined, 1, "EMP-1", "Angela Santos", 750, 1500, 15, 375, 375, 100, 100, 3215]);
    expect((sheet.getRow(7).values as unknown[])[11]).toBe(4935.62);
  });

  it("writes the register as CSV with the same columns", () => {
    const lines = buildRegisterCsv(INPUT).replace(/^﻿/, "").split("\n");
    expect(lines[0]).toContain('"Employee #","Employee","Rate type"');
    expect(lines[1]).toBe('"1","EMP-1","Angela Santos","Monthly","30000","10","1","30","13620.69","1000","500","15120.69","750","375","100","296.8","1000","12598.89"');
    expect(lines).toHaveLength(3);
  });
});
