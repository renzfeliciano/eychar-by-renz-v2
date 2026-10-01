"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExportDialog } from "@/components/shared/export-dialog";
import { downloadBlob } from "@/lib/export/download";
import { exportFilename } from "@/lib/export/filename";
import { XLSX_MIME, buildTableCsv, buildTableWorkbook, countLabel, type TableExportSpec } from "@/lib/export/table-export";

/**
 * Export (Excel or CSV) plus Print for a module list page. The rows either
 * arrive already resolved from the server page (`rows`), or, for sensitive
 * or large lists, are fetched only when someone exports (`loadRows`, with
 * `count` for the summary and `onPrint` for printing). The files are built
 * here in the browser from the module's column spec.
 */
export function TableExportActions<Row>({
  spec,
  rows,
  loadRows,
  count,
  onPrint,
  organizationName,
  fileKey,
  testIdPrefix,
  note,
}: {
  spec: TableExportSpec<Row>;
  rows?: Row[];
  /** Fetches the rows on demand instead of `rows`. */
  loadRows?: () => Promise<Row[]>;
  /** How many rows an export will hold, when `rows` isn't passed. */
  count?: number;
  /** Replaces the default `window.print()`, e.g. to load the rows first. */
  onPrint?: () => void;
  organizationName: string;
  /** The module part of the filename, e.g. "employees". */
  fileKey: string;
  /** e.g. "cases": gives cases-export-button, cases-export-xlsx, cases-print-button. */
  testIdPrefix: string;
  /** Anything the reader should know before sharing the file. */
  note?: string;
}) {
  const filename = () => exportFilename(organizationName, fileKey);
  const total = count ?? rows?.length ?? 0;
  const getRows = async () => rows ?? (loadRows ? await loadRows() : []);

  return (
    <div className="flex items-center gap-2">
      <ExportDialog
        title={`Export ${spec.title.toLowerCase()}`}
        description={`${countLabel(total, spec.noun)} will be exported.${note ? ` ${note}` : ""}`}
        testIdPrefix={`${testIdPrefix}-export`}
        disabled={total === 0}
        targets={{
          xlsx: {
            build: async () => {
              const workbook = await buildTableWorkbook(spec, await getRows(), { organizationName });
              const buffer = await workbook.xlsx.writeBuffer();
              downloadBlob(new Blob([buffer], { type: XLSX_MIME }), `${filename()}.xlsx`);
            },
          },
          csv: {
            build: async () => {
              downloadBlob(new Blob([buildTableCsv(spec, await getRows())], { type: "text/csv;charset=utf-8" }), `${filename()}.csv`);
            },
          },
        }}
      />
      <Button type="button" variant="outline" size="sm" onClick={onPrint ?? (() => window.print())} disabled={total === 0} data-testid={`${testIdPrefix}-print-button`}>
        <Printer className="size-3.5" />
        Print
      </Button>
    </div>
  );
}
