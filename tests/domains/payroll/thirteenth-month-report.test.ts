import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildThirteenthMonthReportCsv, buildThirteenthMonthReportWorkbook, type ThirteenthMonthReportInput } from "@/domains/payroll/thirteenth-month-report";

const INPUT: ThirteenthMonthReportInput = {
  organizationName: "Acme",
  runNumber: "PR-2026-0042",
  year: 2026,
  scopeLabel: "All projects",
  payDateLabel: "Dec 20, 2026",
  statusLabel: "Released",
  records: [
    { employeeNumber: "E1", employeeName: "Angela Santos", netPay: 6500, thirteenthMonth: { basicEarned: 15000, estimatedBasic: 75000, divisor: 12, alreadyPaid: 1000 } },
    { employeeNumber: "E2", employeeName: "Carlos Santos", netPay: 3850, thirteenthMonth: { basicEarned: 7700, estimatedBasic: 38500, divisor: 12, alreadyPaid: 0 } },
  ],
};

describe("13th-month report (DOLE data)", () => {
  it("lists each employee's basis, what was paid earlier and in this run, and the year's total", () => {
    const lines = buildThirteenthMonthReportCsv(INPUT).trim().split(/\r?\n/);
    expect(lines[0]).toContain("13th month for the year");
    expect(lines[1]).toContain("Angela Santos");
    expect(lines[1]).toBe(`"E1","Angela Santos","15000","75000","12","1000","6500","7500"`);
  });

  it("totals the money columns in the workbook", async () => {
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(await buildThirteenthMonthReportWorkbook(INPUT).xlsx.writeBuffer());
    const sheet = loaded.getWorksheet("13th month")!;
    expect(sheet.getRow(7).values).toEqual([undefined, "", "Total", 22700, 113500, "", 1000, 10350, 11350]);
  });
});
