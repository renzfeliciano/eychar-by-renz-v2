import ExcelJS from "exceljs";
import { buildCsvContent } from "@/lib/csv";
import { BRAND } from "@/lib/brand";
import { sumMoney } from "./engine/money";

/**
 * The data for DOLE's annual 13th-month compliance report (payroll plan Phase 3; due January 15 per the
 * plan's sources, not yet checked against the official form): one row per employee with what the 13th
 * month was computed from and what was paid, and the totals. HR copies it into the form DOLE asks for.
 */
export type ThirteenthMonthReportInput = {
  organizationName: string;
  runNumber: string;
  year: number;
  scopeLabel: string;
  payDateLabel: string;
  statusLabel: string;
  records: {
    employeeNumber: string;
    employeeName: string;
    netPay: number;
    thirteenthMonth?: { basicEarned: number; estimatedBasic?: number | null; divisor: number; alreadyPaid?: number | null } | null;
  }[];
};

const HEADERS = ["Employee no.", "Employee", "Basic pay earned", "Basic pay estimated", "Divided by", "Paid earlier in the year", "13th month paid in this run", "13th month for the year"];

function rows(input: ThirteenthMonthReportInput) {
  return input.records.map((record) => {
    const basis = record.thirteenthMonth;
    const earlier = basis?.alreadyPaid ?? 0;
    return [record.employeeNumber, record.employeeName, basis?.basicEarned ?? 0, basis?.estimatedBasic ?? 0, basis?.divisor ?? "", earlier, record.netPay, sumMoney([earlier, record.netPay])];
  });
}

export function buildThirteenthMonthReportCsv(input: ThirteenthMonthReportInput): string {
  return buildCsvContent(HEADERS, rows(input));
}

export function buildThirteenthMonthReportWorkbook(input: ThirteenthMonthReportInput): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = BRAND.fullName;
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("13th month", { views: [{ state: "frozen", ySplit: 4 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  sheet.getCell(1, 1).value = `${input.organizationName}: 13th month pay ${input.year} (${input.runNumber})`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.getCell(2, 1).value = `${input.scopeLabel} · paid ${input.payDateLabel} · ${input.statusLabel} · ${input.records.length} employee${input.records.length === 1 ? "" : "s"}`;
  sheet.getCell(2, 1).font = { color: { argb: "FF6B7280" } };
  sheet.getRow(4).values = HEADERS;
  sheet.getRow(4).font = { bold: true };
  const body = rows(input);
  body.forEach((values, index) => (sheet.getRow(5 + index).values = values));
  const totals = sheet.getRow(5 + body.length);
  totals.values = ["", "Total", ...[2, 3].map((column) => sumMoney(body.map((row) => Number(row[column])))), "", ...[5, 6, 7].map((column) => sumMoney(body.map((row) => Number(row[column]))))];
  totals.font = { bold: true };
  for (const column of [3, 4, 6, 7, 8]) sheet.getColumn(column).numFmt = "#,##0.00";
  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 28;
  for (const column of [3, 4, 5, 6, 7, 8]) sheet.getColumn(column).width = 18;
  return workbook;
}
