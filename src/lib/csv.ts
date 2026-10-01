const UTF8_BOM = "﻿";

/**
 * A cell Excel/Sheets/LibreOffice would read as a formula (or as a DDE
 * payload): leading =, +, -, @, tab or carriage return.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
/** A plain decimal number such as "-12.5" or "+3": safe, and should stay a number in the sheet. */
const PLAIN_NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * Neutralises CSV formula injection (OWASP "CSV Injection"): a string that a
 * spreadsheet would evaluate gets a leading single quote, which makes the app
 * treat it as text. Real numbers, and strings that are just a finite number
 * ("-12.5"), are left alone so amounts still sum in the sheet.
 */
export function neutralizeCsvCell(cell: string | number): string {
  if (typeof cell === "number") return String(cell);
  if (!FORMULA_TRIGGER.test(cell)) return cell;
  if (PLAIN_NUMBER.test(cell) && Number.isFinite(Number(cell))) return cell;
  return `'${cell}`;
}

/**
 * A BOM-less UTF-8 CSV is read by Excel as Windows-1252, mangling any
 * non-ASCII character (e.g. the "—" used for an unset value) into garbage
 * like "â€"". The BOM signals the encoding so Excel decodes it correctly.
 */
export function buildCsvContent(
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): string {
  const escape = (cell: string | number) => `"${neutralizeCsvCell(cell).replaceAll('"', '""')}"`;
  return UTF8_BOM + [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}
