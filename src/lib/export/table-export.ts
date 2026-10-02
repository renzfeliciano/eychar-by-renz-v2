import type ExcelJS from "exceljs";
import { buildCsvContent } from "@/lib/csv";
import { BRAND } from "@/lib/brand";
import { formatDateTime } from "@/lib/app-time";

export type ExportValue = string | number | null;

export type ExportColumn<Row> = {
  header: string;
  /** Excel column width in characters. */
  width?: number;
  /** Long free text (addresses, remarks): wraps in Excel instead of running off the page. */
  wrap?: boolean;
  value: (row: Row) => ExportValue;
};

/**
 * One module's export: the same columns feed the CSV and the Excel
 * template, so the two formats can never drift apart.
 */
export type TableExportSpec<Row> = {
  title: string;
  sheetName: string;
  /** Singular and plural, for "12 employees". */
  noun: [string, string];
  columns: ExportColumn<Row>[];
};

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// The same neutral palette as the attendance and schedule exports: these
// files get printed and forwarded, so no brand color.
const HEADER_FILL = "FFF9FAFB";
const HEADER_BORDER = "FFD1D5DB";
const MUTED_TEXT = "FF6B7280";

export function countLabel(count: number, [singular, plural]: [string, string]): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function cells<Row>(spec: TableExportSpec<Row>, row: Row, index: number): ExportValue[] {
  return [index + 1, ...spec.columns.map((column) => column.value(row))];
}

/** Numbered rows with a UTF-8 BOM, so Excel opens it with every character intact. */
export function buildTableCsv<Row>(spec: TableExportSpec<Row>, rows: Row[]): string {
  return buildCsvContent(
    ["#", ...spec.columns.map((column) => column.header)],
    rows.map((row, index) => cells(spec, row, index).map((value) => value ?? "")),
  );
}

/**
 * The shared Excel template: "{Organization}: {title}" on top, the record
 * count and when it was generated below it, then a frozen, filterable header
 * row. Set up to print landscape, fit to one page wide, with the header
 * repeated on every page. exceljs is loaded on demand, so pages that offer
 * an export don't carry it until someone actually exports.
 */
export async function buildTableWorkbook<Row>(
  spec: TableExportSpec<Row>,
  rows: Row[],
  options: { organizationName: string; generatedAt?: Date },
): Promise<ExcelJS.Workbook> {
  const excelModule = await import("exceljs");
  const Excel = (excelModule as unknown as { default?: typeof ExcelJS }).default ?? (excelModule as unknown as typeof ExcelJS);
  const generatedAt = options.generatedAt ?? new Date();

  const workbook = new Excel.Workbook();
  workbook.creator = BRAND.fullName;
  workbook.created = generatedAt;

  const HEADER_ROW = 4;
  const lastColumn = spec.columns.length + 1;
  const sheet = workbook.addWorksheet(spec.sheetName, {
    views: [{ state: "frozen", ySplit: HEADER_ROW }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}` },
  });

  sheet.getCell(1, 1).value = `${options.organizationName}: ${spec.title}`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.getCell(2, 1).value = `${countLabel(rows.length, spec.noun)} · generated ${formatDateTime(generatedAt, "long")}`;
  sheet.getCell(2, 1).font = { color: { argb: MUTED_TEXT } };

  const header = sheet.getRow(HEADER_ROW);
  header.values = ["#", ...spec.columns.map((column) => column.header)];
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: "thin", color: { argb: HEADER_BORDER } } };
    cell.alignment = { vertical: "middle" };
  });

  sheet.getColumn(1).width = 5;
  spec.columns.forEach((column, index) => {
    const excelColumn = sheet.getColumn(index + 2);
    excelColumn.width = column.width ?? Math.max(12, column.header.length + 2);
    if (column.wrap) excelColumn.alignment = { wrapText: true, vertical: "top" };
  });

  rows.forEach((row, index) => {
    sheet.getRow(HEADER_ROW + 1 + index).values = cells(spec, row, index);
  });
  sheet.autoFilter = `A${HEADER_ROW}:${sheet.getColumn(lastColumn).letter}${HEADER_ROW}`;

  return workbook;
}
