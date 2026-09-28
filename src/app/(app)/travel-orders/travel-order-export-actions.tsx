"use client";

import { TableExportActions } from "@/components/shared/table-export-actions";
import type { TableExportSpec } from "@/lib/export/table-export";

export type TravelOrderExportRow = {
  employees: string;
  startDate: string;
  endDate: string;
  remarks: string;
  status: string;
};

const TRAVEL_ORDER_EXPORT: TableExportSpec<TravelOrderExportRow> = {
  title: "Travel orders",
  sheetName: "Travel orders",
  noun: ["travel order", "travel orders"],
  columns: [
    { header: "Employees", width: 40, wrap: true, value: (row) => row.employees },
    { header: "Start date", width: 13, value: (row) => row.startDate },
    { header: "End date", width: 13, value: (row) => row.endDate },
    { header: "Remarks", width: 50, wrap: true, value: (row) => row.remarks },
    { header: "Status", width: 13, value: (row) => row.status },
  ],
};

export function TravelOrderExportActions({ rows, organizationName }: { rows: TravelOrderExportRow[]; organizationName: string }) {
  return (
    <TableExportActions spec={TRAVEL_ORDER_EXPORT} rows={rows} organizationName={organizationName} fileKey="travel-orders" testIdPrefix="travel-orders" />
  );
}
