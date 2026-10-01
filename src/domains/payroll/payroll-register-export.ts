import ExcelJS from "exceljs";
import { buildCsvContent } from "@/lib/csv";
import { roundMoney, sumMoney } from "./engine/money";
import { BRAND } from "@/lib/brand";

type RegisterRecord = {
  employeeNumber: string;
  employeeName: string;
  rateType: string;
  rate: number;
  attendance: { daysWorked?: number | null; absentDays?: number | null; lateMinutes?: number | null; undertimeMinutes?: number | null };
  earnings: { code: string; label: string; amount: number; taxable: boolean }[];
  contributions: { code: string; name: string; employee: number; employer: number; extra: number; extraLabel?: string | null }[];
  deductions: { code: string; label: string; amount: number }[];
  grossPay: number;
  tax: number;
  netPay: number;
};

export type RegisterInput = {
  organizationName: string;
  runNumber: string;
  scopeLabel: string;
  periodLabel: string;
  payDateLabel: string;
  statusLabel: string;
  records: RegisterRecord[];
};

// Basic pay here is net of absences and tardiness, the way a register reads.
const BASIC_CODES = new Set(["basic", "absences", "tardiness"]);
const HEADER_FILL = "FFF9FAFB";
const TOTAL_FILL = "FFF3F4F6";
const MONEY_FORMAT = "#,##0.00";

function contributionColumns(records: RegisterRecord[]) {
  const seen = new Map<string, { code: string; name: string; extraLabel: string | null }>();
  for (const record of records) {
    for (const line of record.contributions) {
      const existing = seen.get(line.code);
      const extraLabel = line.extra > 0 ? (line.extraLabel ?? "Extra") : null;
      if (!existing) seen.set(line.code, { code: line.code, name: line.name, extraLabel });
      else if (!existing.extraLabel && extraLabel) existing.extraLabel = extraLabel;
    }
  }
  return [...seen.values()];
}

const amountOf = (record: RegisterRecord, code: string, side: "employee" | "employer" | "extra") =>
  record.contributions.find((line) => line.code === code)?.[side] ?? 0;

function registerRows(input: RegisterInput) {
  const contributions = contributionColumns(input.records);
  const headers = [
    "#",
    "Employee #",
    "Employee",
    "Rate type",
    "Rate",
    "Days worked",
    "Absences",
    "Late/undertime (min)",
    "Basic pay",
    "Allowances",
    "Other earnings",
    "Gross pay",
    ...contributions.map((column) => column.name),
    "Withholding tax",
    "Other deductions",
    "Net pay",
  ];
  const rows = input.records.map((record, index) => [
    index + 1,
    record.employeeNumber,
    record.employeeName,
    record.rateType === "daily" ? "Daily" : "Monthly",
    record.rate,
    record.attendance.daysWorked ?? 0,
    record.attendance.absentDays ?? 0,
    (record.attendance.lateMinutes ?? 0) + (record.attendance.undertimeMinutes ?? 0),
    sumMoney(record.earnings.filter((line) => BASIC_CODES.has(line.code)).map((line) => line.amount)),
    sumMoney(record.earnings.filter((line) => line.code === "allowance").map((line) => line.amount)),
    sumMoney(record.earnings.filter((line) => !BASIC_CODES.has(line.code) && line.code !== "allowance").map((line) => line.amount)),
    record.grossPay,
    ...contributions.map((column) => amountOf(record, column.code, "employee")),
    record.tax,
    sumMoney(record.deductions.map((line) => line.amount)),
    record.netPay,
  ]);
  return { headers, rows, contributions };
}

/** The register as CSV: one row per employee, no totals row (it would break sorting and pivots). */
export function buildRegisterCsv(input: RegisterInput): string {
  const { headers, rows } = registerRows(input);
  return buildCsvContent(headers, rows);
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle", wrapText: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
  });
}

function addTotalsRow(sheet: ExcelJS.Worksheet, rowNumber: number, label: string, sums: Map<number, number>) {
  const row = sheet.getRow(rowNumber);
  row.getCell(3).value = label;
  for (const [column, value] of sums) row.getCell(column).value = roundMoney(value);
  row.font = { bold: true };
  row.eachCell({ includeEmpty: false }, (cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
    cell.border = { top: { style: "thin", color: { argb: "FF9CA3AF" } } };
  });
}

function sheetWithTitle(workbook: ExcelJS.Workbook, name: string, title: string, subtitle: string) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", xSplit: 3, ySplit: 4 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "4:4" },
  });
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.getCell(2, 1).value = subtitle;
  sheet.getCell(2, 1).font = { color: { argb: "FF6B7280" } };
  return sheet;
}

/**
 * The payroll register workbook. "Register": one row per employee, the
 * pay broken down into basic, allowances, other earnings, each
 * contribution's employee share, tax and other deductions, with a totals
 * row. "Contributions": employee, employer and add-on (EC) shares per
 * agency, the figures a remittance needs.
 */
export function buildRegisterWorkbook(input: RegisterInput): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = BRAND.fullName;
  workbook.created = new Date();
  const subtitle = `${input.scopeLabel} · ${input.periodLabel} · pay date ${input.payDateLabel} · ${input.statusLabel}`;
  const employeesLabel = `Total (${input.records.length} employee${input.records.length === 1 ? "" : "s"})`;

  const { headers, rows, contributions } = registerRows(input);
  const register = sheetWithTitle(workbook, "Register", `${input.organizationName}: payroll register ${input.runNumber}`, subtitle);
  register.getRow(4).values = headers;
  styleHeader(register.getRow(4));
  rows.forEach((values, index) => (register.getRow(5 + index).values = values));
  const firstMoneyColumn = 9;
  const sums = new Map<number, number>();
  for (let column = firstMoneyColumn; column <= headers.length; column++) {
    sums.set(column, rows.reduce((sum, values) => sum + Number(values[column - 1] ?? 0), 0));
    register.getColumn(column).numFmt = MONEY_FORMAT;
    register.getColumn(column).width = 14;
  }
  register.getColumn(5).numFmt = MONEY_FORMAT;
  addTotalsRow(register, 5 + rows.length, employeesLabel, sums);
  [5, 12, 28, 10, 12, 8, 9, 10].forEach((width, index) => (register.getColumn(index + 1).width = width));
  register.getRow(4).height = 30;

  const remittance = sheetWithTitle(workbook, "Contributions", `${input.organizationName}: contributions ${input.runNumber}`, subtitle);
  const remittanceHeaders = [
    "#",
    "Employee #",
    "Employee",
    ...contributions.flatMap((column) => [`${column.name} (EE)`, `${column.name} (ER)`, ...(column.extraLabel ? [`${column.name} (${column.extraLabel})`] : [])]),
    "Total remittance",
  ];
  remittance.getRow(4).values = remittanceHeaders;
  styleHeader(remittance.getRow(4));
  input.records.forEach((record, index) => {
    const amounts = contributions.flatMap((column) => [
      amountOf(record, column.code, "employee"),
      amountOf(record, column.code, "employer"),
      ...(column.extraLabel ? [amountOf(record, column.code, "extra")] : []),
    ]);
    remittance.getRow(5 + index).values = [index + 1, record.employeeNumber, record.employeeName, ...amounts, sumMoney(amounts)];
  });
  const remittanceSums = new Map<number, number>();
  for (let column = 4; column <= remittanceHeaders.length; column++) {
    let sum = 0;
    for (let index = 0; index < input.records.length; index++) sum += Number(remittance.getRow(5 + index).getCell(column).value ?? 0);
    remittanceSums.set(column, sum);
    remittance.getColumn(column).numFmt = MONEY_FORMAT;
    remittance.getColumn(column).width = 14;
  }
  addTotalsRow(remittance, 5 + input.records.length, employeesLabel, remittanceSums);
  [5, 12, 28].forEach((width, index) => (remittance.getColumn(index + 1).width = width));
  remittance.getRow(4).height = 30;

  return workbook;
}
