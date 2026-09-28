import ExcelJS from "exceljs";
import { buildCsvContent } from "@/lib/csv";
import { NO_RECORD_LABEL, type AttendanceReport, type AttendanceReportRow } from "./attendance-report";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HEADERS = [
  "Date",
  "Day",
  "Employee #",
  "Employee",
  "Status",
  "Check-in",
  "Check-out",
  "Hours worked",
  "Scheduled shift",
  "Site",
  "Distance from site (m)",
  "Biometric verified",
  "Recorded by",
  "Notes",
];
const COLUMN_WIDTHS = [12, 6, 14, 28, 14, 10, 10, 13, 18, 24, 12, 11, 13, 32];

// Neutral fills only, as in the schedule export: a document that gets printed and shared.
const HEADER_FILL = "FFF9FAFB";
const MUTED_TEXT = "FF6B7280";

function yesNo(value: boolean | null): string {
  return value === null ? "" : value ? "Yes" : "No";
}

function rowValues(row: AttendanceReportRow): (string | number | null)[] {
  return [
    row.date,
    WEEKDAYS[row.weekday],
    row.employeeNumber,
    row.name,
    row.statusName,
    row.checkIn,
    row.checkOut,
    row.hoursWorked,
    row.scheduled,
    row.site,
    row.distanceMeters,
    yesNo(row.verified),
    row.source,
    row.notes,
  ];
}

/** One row per employee per day: sorts, filters and pivots cleanly in any spreadsheet. */
export function buildAttendanceCsv(report: AttendanceReport): string {
  return buildCsvContent(
    HEADERS,
    report.rows.map((row) => rowValues(row).map((value) => value ?? "")),
  );
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
  });
}

/**
 * "Attendance": the full log with filters, one row per employee-day.
 * "Summary": per employee, how many days fell under each status and the hours worked.
 */
export function buildAttendanceWorkbook(report: AttendanceReport, options: { organizationName: string }): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WorkforceHub";
  workbook.created = new Date();

  const log = workbook.addWorksheet("Attendance", {
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  log.getCell(1, 1).value = `${options.organizationName}: attendance for ${report.label}`;
  log.getCell(1, 1).font = { bold: true, size: 14 };
  styleHeaderRow(log.getRow(3));
  HEADERS.forEach((header, index) => {
    log.getCell(3, index + 1).value = header;
    log.getColumn(index + 1).width = COLUMN_WIDTHS[index];
  });
  report.rows.forEach((row, index) => {
    const excelRow = log.getRow(4 + index);
    excelRow.values = rowValues(row);
    if (row.statusCode === null) excelRow.font = { color: { argb: MUTED_TEXT } };
  });
  log.getColumn(8).numFmt = "0.00";
  log.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: HEADERS.length } };

  // Summary columns: every status in the catalog, then any code found in
  // the records that isn't in it (an old or retired code), then "No record".
  const statusNames = [...new Set([...report.statuses.map((status) => status.name), ...report.rows.filter((row) => row.statusCode).map((row) => row.statusName)])];
  const columns = [...statusNames, NO_RECORD_LABEL];

  const summary = workbook.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 3 }] });
  summary.getCell(1, 1).value = `${options.organizationName}: attendance summary for ${report.label}`;
  summary.getCell(1, 1).font = { bold: true, size: 14 };
  summary.getRow(3).values = ["Employee #", "Employee", ...columns, "Hours worked"];
  styleHeaderRow(summary.getRow(3));
  summary.getColumn(1).width = 14;
  summary.getColumn(2).width = 28;
  columns.forEach((_, index) => (summary.getColumn(3 + index).width = 12));
  summary.getColumn(3 + columns.length).width = 13;
  summary.getColumn(3 + columns.length).numFmt = "0.00";

  const byEmployee = new Map<string, { employeeNumber: string; name: string; counts: Map<string, number>; hours: number }>();
  for (const row of report.rows) {
    const totals = byEmployee.get(row.employeeId) ?? { employeeNumber: row.employeeNumber, name: row.name, counts: new Map(), hours: 0 };
    totals.counts.set(row.statusName, (totals.counts.get(row.statusName) ?? 0) + 1);
    totals.hours += row.hoursWorked ?? 0;
    byEmployee.set(row.employeeId, totals);
  }
  [...byEmployee.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((totals, index) => {
      summary.getRow(4 + index).values = [
        totals.employeeNumber,
        totals.name,
        ...columns.map((column) => totals.counts.get(column) ?? 0),
        Math.round(totals.hours * 100) / 100,
      ];
    });

  return workbook;
}
