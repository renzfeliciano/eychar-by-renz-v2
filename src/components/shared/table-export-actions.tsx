"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExportDialog } from "@/components/shared/export-dialog";
import { downloadBlob } from "@/lib/export/download";
import { exportFilename } from "@/lib/export/filename";
import { XLSX_MIME, buildTableCsv, buildTableWorkbook, countLabel, type TableExportSpec } from "@/lib/export/table-export";

/**
 * Export (Excel or CSV) plus Print for a module list page. The rows arrive
 * already resolved for display from the server page; the files are built
 * here in the browser from the module's column spec.
 */
export function TableExportActions<Row>({
  spec,
  rows,
  organizationName,
  fileKey,
  testIdPrefix,
  note,
}: {
  spec: TableExportSpec<Row>;
  rows: Row[];
  organizationName: string;
  /** The module part of the filename, e.g. "employees". */
  fileKey: string;
  /** e.g. "cases": gives cases-export-button, cases-export-xlsx, cases-print-button. */
  testIdPrefix: string;
  /** Anything the reader should know before sharing the file. */
  note?: string;
}) {
  const filename = () => exportFilename(organizationName, fileKey);

  return (
    <div className="flex items-center gap-2">
      <ExportDialog
        title={`Export ${spec.title.toLowerCase()}`}
        description={`${countLabel(rows.length, spec.noun)} will be exported.${note ? ` ${note}` : ""}`}
        testIdPrefix={`${testIdPrefix}-export`}
        disabled={rows.length === 0}
        targets={{
          xlsx: {
            build: async () => {
              const workbook = await buildTableWorkbook(spec, rows, { organizationName });
              const buffer = await workbook.xlsx.writeBuffer();
              downloadBlob(new Blob([buffer], { type: XLSX_MIME }), `${filename()}.xlsx`);
            },
          },
          csv: {
            build: async () => {
              downloadBlob(new Blob([buildTableCsv(spec, rows)], { type: "text/csv;charset=utf-8" }), `${filename()}.csv`);
            },
          },
        }}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => window.print()} disabled={rows.length === 0} data-testid={`${testIdPrefix}-print-button`}>
        <Printer className="size-3.5" />
        Print
      </Button>
    </div>
  );
}
