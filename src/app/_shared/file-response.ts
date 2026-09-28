import { NextResponse } from "next/server";
import type ExcelJS from "exceljs";

export { filenameSlug } from "@/lib/export/filename";

/** A download the browser saves on its own from a plain GET link, never cached. */
export function csvResponse(csv: string, filename: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function xlsxResponse(workbook: ExcelJS.Workbook, filename: string): Promise<NextResponse> {
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
