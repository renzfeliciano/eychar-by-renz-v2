const UTF8_BOM = "﻿";

/**
 * A BOM-less UTF-8 CSV is read by Excel as Windows-1252, mangling any
 * non-ASCII character (e.g. the "—" used for an unset value) into garbage
 * like "â€"". The BOM signals the encoding so Excel decodes it correctly.
 */
export function buildCsvContent(
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): string {
  const escape = (cell: string | number) => `"${String(cell).replaceAll('"', '""')}"`;
  return UTF8_BOM + [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

export function downloadCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[],
  filename: string,
) {
  const csv = buildCsvContent(headers, rows);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
