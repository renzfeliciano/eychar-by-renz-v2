import ExcelJS from "exceljs";
import { buildCsvContent } from "@/lib/csv";
import type { ScheduleMonthView } from "./schedule-service";
import { shiftColor } from "./shift-colors";
import { describeShiftHours, type ShiftHoursShape } from "./shift-display";
import { BRAND } from "@/lib/brand";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DETAIL_HEADERS = ["Employee #", "Employee", "Date", "Day", "Shift code", "Shift", "Hours", "Custom hours", "Project"];

// Headers stay neutral; each scheduled day wears its shift's own color (the
// same light tint as the grid on screen), with the code always printed so
// the sheet still reads in black and white.
const WEEKEND_HEADER_FILL = "FFF3F4F6";
const HEADER_FILL = "FFF9FAFB";
const CUSTOM_MARK = "*";

export type LegendShift = ShiftHoursShape & { code: string; name: string; color?: string | null };

const exportHours = (shift: ShiftHoursShape) => describeShiftHours(shift, { dash: "-", restLabel: "" });

function colorCell(cell: ExcelJS.Cell, colorKey: string | null | undefined) {
  const color = shiftColor(colorKey);
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color.excelFill } };
  cell.font = { ...(cell.font ?? {}), color: { argb: color.excelFont } };
}

/** "22:00-07:00 (+1 day)" — an end before the start means the shift ends the next morning. */
export function formatShiftHours(startTime: string | null, endTime: string | null): string {
  if (!startTime || !endTime) return "";
  return endTime < startTime ? `${startTime}-${endTime} (+1 day)` : `${startTime}-${endTime}`;
}

function detailRows(view: ScheduleMonthView): string[][] {
  const rows: string[][] = [];
  for (const row of view.rows) {
    for (const day of view.days) {
      const cell = row.cells[day.date];
      if (!cell) continue;
      rows.push([
        row.employeeNumber,
        row.name,
        day.date,
        WEEKDAYS[day.weekday],
        cell.code,
        cell.name,
        exportHours(cell),
        cell.customTimes ? "Yes" : "",
        cell.projectName ?? "",
      ]);
    }
  }
  return rows;
}

/** One row per scheduled day: the shape that sorts, filters and pivots cleanly in any spreadsheet. */
export function buildScheduleCsv(view: ScheduleMonthView): string {
  return buildCsvContent(DETAIL_HEADERS, detailRows(view));
}

/**
 * A print-ready month grid ("Schedule": employees × days, shift codes, a
 * legend) plus the same data long-form ("Details") for filtering by site
 * or date.
 */
export function buildScheduleWorkbook(view: ScheduleMonthView, options: { organizationName: string; shifts: LegendShift[] }): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = BRAND.fullName;
  workbook.created = new Date();

  const grid = workbook.addWorksheet("Schedule", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 4 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const lastColumn = 2 + view.days.length;

  grid.getCell(1, 1).value = `${options.organizationName}: schedule for ${view.label}`;
  grid.getCell(1, 1).font = { bold: true, size: 14 };
  grid.mergeCells(1, 1, 1, lastColumn);

  grid.getColumn(1).width = 14;
  grid.getColumn(2).width = 28;
  grid.getCell(3, 1).value = "Employee #";
  grid.getCell(3, 2).value = "Employee";
  grid.mergeCells(3, 1, 4, 1);
  grid.mergeCells(3, 2, 4, 2);

  view.days.forEach((day, index) => {
    const column = 3 + index;
    grid.getColumn(column).width = 6;
    const dayCell = grid.getCell(3, column);
    const weekdayCell = grid.getCell(4, column);
    dayCell.value = day.day;
    weekdayCell.value = WEEKDAYS[day.weekday];
    for (const cell of [dayCell, weekdayCell]) {
      cell.alignment = { horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: day.isWeekend ? WEEKEND_HEADER_FILL : HEADER_FILL } };
    }
  });
  for (const rowNumber of [3, 4]) {
    grid.getRow(rowNumber).font = { bold: true };
    for (const column of [1, 2]) {
      grid.getCell(rowNumber, column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      grid.getCell(rowNumber, column).alignment = { vertical: "middle" };
    }
  }

  view.rows.forEach((row, rowIndex) => {
    const rowNumber = 5 + rowIndex;
    grid.getCell(rowNumber, 1).value = row.employeeNumber;
    grid.getCell(rowNumber, 2).value = row.name;
    view.days.forEach((day, dayIndex) => {
      const scheduled = row.cells[day.date];
      if (!scheduled) return;
      const cell = grid.getCell(rowNumber, 3 + dayIndex);
      cell.value = scheduled.customTimes ? `${scheduled.code}${CUSTOM_MARK}` : scheduled.code;
      cell.alignment = { horizontal: "center" };
      colorCell(cell, scheduled.color);
      cell.font = { ...cell.font, bold: true };
      if (scheduled.customTimes) cell.note = `Custom hours: ${exportHours(scheduled)}`;
    });
  });

  let legendRow = 5 + view.rows.length + 1;
  grid.getCell(legendRow, 1).value = "Shifts";
  grid.getCell(legendRow, 1).font = { bold: true };
  for (const shift of options.shifts) {
    legendRow += 1;
    const swatch = grid.getCell(legendRow, 1);
    swatch.value = shift.code;
    swatch.alignment = { horizontal: "center" };
    colorCell(swatch, shift.color);
    swatch.font = { ...swatch.font, bold: true };
    grid.getCell(legendRow, 2).value = shift.name;
    grid.getCell(legendRow, 3).value = shift.kind === "rest" ? "Rest day" : exportHours(shift);
  }
  const customUsed = view.rows.some((row) => Object.values(row.cells).some((cell) => cell.customTimes));
  if (customUsed) {
    legendRow += 2;
    grid.getCell(legendRow, 1).value = `${CUSTOM_MARK} Custom hours for that day; hover the cell or see Details for the times.`;
    grid.getCell(legendRow, 1).font = { italic: true, color: { argb: "FF475569" } };
  }

  const details = workbook.addWorksheet("Details", { views: [{ state: "frozen", ySplit: 1 }] });
  details.addRow(DETAIL_HEADERS);
  details.getRow(1).font = { bold: true };
  // Shift code cells carry the shift color, matching the grid sheet.
  const colors = view.rows.flatMap((row) => view.days.map((day) => row.cells[day.date]).filter(Boolean).map((cell) => cell.color));
  detailRows(view).forEach((row, index) => {
    details.addRow(row);
    colorCell(details.getCell(index + 2, 5), colors[index]);
  });
  details.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: DETAIL_HEADERS.length } };
  [14, 28, 12, 6, 11, 18, 28, 13, 28].forEach((width, index) => {
    details.getColumn(index + 1).width = width;
  });

  return workbook;
}
