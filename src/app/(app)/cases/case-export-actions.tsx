"use client";

import { TableExportActions } from "@/components/shared/table-export-actions";
import type { TableExportSpec } from "@/lib/export/table-export";

export type CaseExportRow = {
  caseName: string;
  caseNumber: string;
  project: string;
  classification: string;
  status: string;
  legalCounsel: string;
  briefHistory: string;
};

const CASE_EXPORT: TableExportSpec<CaseExportRow> = {
  title: "Case monitoring",
  sheetName: "Cases",
  noun: ["case", "cases"],
  columns: [
    { header: "Project", width: 24, value: (row) => row.project },
    { header: "Case name", width: 30, value: (row) => row.caseName },
    { header: "Case number", width: 16, value: (row) => row.caseNumber },
    { header: "Classification", width: 16, value: (row) => row.classification },
    { header: "Status", width: 14, value: (row) => row.status },
    { header: "Legal counsel", width: 22, value: (row) => row.legalCounsel },
    { header: "Brief history", width: 60, wrap: true, value: (row) => row.briefHistory },
  ],
};

export function CaseExportActions({ rows, organizationName }: { rows: CaseExportRow[]; organizationName: string }) {
  return <TableExportActions spec={CASE_EXPORT} rows={rows} organizationName={organizationName} fileKey="case-monitoring" testIdPrefix="cases" />;
}
