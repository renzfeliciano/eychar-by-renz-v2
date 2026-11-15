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
  it("names the run type in the sheet subtitle, and leaves it out for callers that don't give one", async () => {
    const subtitleOf = async (input: RegisterInput) => {
      const loaded = new ExcelJS.Workbook();
      await loaded.xlsx.load(await buildRegisterWorkbook(input).xlsx.writeBuffer());
      return String(loaded.getWorksheet("Register")!.getRow(2).getCell(1).value);
    };
    expect(await subtitleOf({ ...INPUT, runTypeLabel: "13th month" })).toMatch(/^13th month · /);
    expect(await subtitleOf(INPUT)).not.toMatch(/13th month/);
  });

  it("lays out one row per employee with a column per contribution and a totals row", async () => {
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(await buildRegisterWorkbook(INPUT).xlsx.writeBuffer());
    const sheet = loaded.getWorksheet("Register")!;

    expect(sheet.getCell("A1").value).toBe("Acme Builders: payroll register PR-2026-0001");
    expect(sheet.getCell("A2").value).toBe("EGI Rufino · Oct 1–15, 2026 · pay date Oct 20, 2026 · Approved");
    expect(sheet.getRow(4).values).toEqual([
      undefined, "#", "Employee #", "Employee", "Rate type", "Rate", "Days worked", "Absences", "Late/undertime (min)",
      "Basic pay", "Allowances", "Overtime", "Holiday & rest day", "Night differential", "13th month", "Other earnings", "Gross pay", "Non-taxable earnings",
      "SSS", "PhilHealth", "Pag-IBIG", "Taxable income", "Withholding tax", "Other deductions", "Net pay",
    ]);
    // Basic pay is net of absences and tardiness.
    // Overtime, holiday/rest day and night pay get their own columns (attendance plan Phase 6).
    // Payroll plan Phase 7: the non-taxable part of gross (the rice allowance) and taxable income (taxable earnings
    // 14,120.69 less 1,225 of contributions) have their own columns.
    expect(sheet.getRow(5).values).toEqual([undefined, 1, "EMP-1", "Angela Santos", "Monthly", 30000, 10, 1, 30, 13620.69, 1000, 500, 0, 0, 0, 0, 15120.69, 1000, 750, 375, 100, 12895.69, 296.8, 1000, 12598.89]);
    const totals = sheet.getRow(7).values as unknown[];
    expect(totals[3]).toBe("Total (2 employees)");
    expect(totals[16]).toBe(22120.69);
    expect(totals[21]).toBe(19230.38);
    expect(totals[24]).toBe(18933.58);
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
    expect(lines[1]).toBe('"1","EMP-1","Angela Santos","Monthly","30000","10","1","30","13620.69","1000","500","0","0","0","0","15120.69","1000","750","375","100","12895.69","296.8","1000","12598.89"');
    expect(lines).toHaveLength(3);
  });
  it("gives 13th month pay its own column and shows final pay lines' taxable split (payroll plan Phase 7)", () => {
    const record = (earnings: RegisterInput["records"][number]["earnings"], extra: Partial<RegisterInput["records"][number]> = {}) => ({
      ...INPUT.records[1],
      contributions: [],
      deductions: [],
      earnings,
      grossPay: earnings.reduce((sum, line) => sum + line.amount, 0),
      tax: 0,
      netPay: earnings.reduce((sum, line) => sum + line.amount, 0),
      ...extra,
    });
    const csv = buildRegisterCsv({
      ...INPUT,
      records: [
        record([{ code: "thirteenth_month", label: "13th month pay (2026)", amount: 30000, taxable: false }]),
        record(
          [
            { code: "basic", label: "Salary balance", amount: 5000, taxable: true },
            { code: "leave_encashment", label: "Leave converted to cash", amount: 2000, taxable: false },
            { code: "year_end_tax_refund", label: "Tax refund", amount: 233.56, taxable: false },
          ],
          { taxableIncome: 4500 },
        ),
      ],
    })
      .replace(/^﻿/, "")
      .split("\n");
    // Every cell is double-quoted with no quotes inside, so a line reads as a JSON array.
    const cellsOf = (line: string) => JSON.parse(`[${line.trim()}]`) as string[];
    const header = cellsOf(csv[0]);
    const cell = (line: string, name: string) => cellsOf(line)[header.indexOf(name)];
    expect(cell(csv[1], "13th month")).toBe("30000");
    expect(cell(csv[1], "Other earnings")).toBe("0");
    expect(cell(csv[1], "Non-taxable earnings")).toBe("30000");
    expect(cell(csv[1], "Taxable income")).toBe("0");
    expect(cell(csv[2], "Basic pay")).toBe("5000");
    expect(cell(csv[2], "Other earnings")).toBe("2233.56");
    expect(cell(csv[2], "Non-taxable earnings")).toBe("2233.56");
    // A stored taxable income wins over the derived one.
    expect(cell(csv[2], "Taxable income")).toBe("4500");
  });

  it("rounds the totals row to the centavo with the engine's money sum", async () => {
    const thirds = [0.1, 0.2, 0.3].map((amount, index) => ({ ...INPUT.records[1], employeeNumber: `E${index}`, contributions: [], deductions: [], earnings: [], grossPay: amount, tax: 0, netPay: amount }));
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(await buildRegisterWorkbook({ ...INPUT, records: thirds }).xlsx.writeBuffer());
    const sheet = loaded.getWorksheet("Register")!;
    const header = sheet.getRow(4).values as unknown[];
    expect((sheet.getRow(8).values as unknown[])[header.indexOf("Gross pay")]).toBe(0.6);
  });
});
