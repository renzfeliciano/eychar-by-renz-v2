"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";

export type TravelOrderExportRow = {
  employees: string;
  startDate: string;
  endDate: string;
  remarks: string;
  status: string;
};

const CSV_HEADERS = ["#", "Employees", "Start date", "End date", "Remarks", "Status"];

function exportTravelOrdersCsv(rows: TravelOrderExportRow[]) {
  const csvRows = rows.map((row, index) => [index + 1, row.employees, row.startDate, row.endDate, row.remarks, row.status]);
  downloadCsv(CSV_HEADERS, csvRows, "workforcehub-travel-orders.csv");
}

export function TravelOrderExportActions({ rows }: { rows: TravelOrderExportRow[] }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => exportTravelOrdersCsv(rows)} disabled={rows.length === 0} data-testid="travel-orders-export-csv-button">
        <Download className="size-3.5" />
        Export CSV
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => window.print()} disabled={rows.length === 0} data-testid="travel-orders-print-button">
        <Printer className="size-3.5" />
        Print
      </Button>
    </div>
  );
}
