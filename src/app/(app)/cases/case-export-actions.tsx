"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";

export type CaseExportRow = {
  caseName: string;
  caseNumber: string;
  project: string;
  classification: string;
  status: string;
  legalCounsel: string;
  briefHistory: string;
};

const CSV_HEADERS = ["#", "Project", "Case name", "Case number", "Classification", "Status", "Legal counsel", "Brief history"];

function exportCasesCsv(rows: CaseExportRow[]) {
  const csvRows = rows.map((row, index) => [
    index + 1,
    row.project,
    row.caseName,
    row.caseNumber,
    row.classification,
    row.status,
    row.legalCounsel,
    row.briefHistory,
  ]);
  downloadCsv(CSV_HEADERS, csvRows, "workforcehub-case-monitoring.csv");
}

export function CaseExportActions({ rows }: { rows: CaseExportRow[] }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => exportCasesCsv(rows)} disabled={rows.length === 0} data-testid="cases-export-csv-button">
        <Download className="size-3.5" />
        Export CSV
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => window.print()} disabled={rows.length === 0} data-testid="cases-print-button">
        <Printer className="size-3.5" />
        Print
      </Button>
    </div>
  );
}
