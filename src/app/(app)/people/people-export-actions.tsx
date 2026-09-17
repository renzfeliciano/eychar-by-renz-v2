"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";

export type PeopleExportRow = {
  employeeNumber: string;
  name: string;
  gender: string;
  position: string;
  project: string;
  employmentStatus: string;
  age: string;
  lengthOfService: string;
  dateHired: string;
  birthDate: string;
  contactNumber: string;
  address: string;
  sssNumber: string;
  philHealthNumber: string;
  pagIbigNumber: string;
  tinNumber: string;
};

const CSV_HEADERS = [
  "#",
  "Employee number",
  "Employee name",
  "Gender",
  "Position",
  "Project/site",
  "Employment status",
  "Age",
  "Length of service",
  "Date hired",
  "Birth date",
  "Contact number",
  "Address",
  "SSS no",
  "PhilHealth no",
  "Pag-IBIG no",
  "TIN no",
];

function exportPeopleCsv(rows: PeopleExportRow[]) {
  const csvRows = rows.map((row, index) => [
    index + 1,
    row.employeeNumber,
    row.name,
    row.gender,
    row.position,
    row.project,
    row.employmentStatus,
    row.age,
    row.lengthOfService,
    row.dateHired,
    row.birthDate,
    row.contactNumber,
    row.address,
    row.sssNumber,
    row.philHealthNumber,
    row.pagIbigNumber,
    row.tinNumber,
  ]);
  downloadCsv(CSV_HEADERS, csvRows, "workforcehub-employees.csv");
}

export function PeopleExportActions({ rows }: { rows: PeopleExportRow[] }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => exportPeopleCsv(rows)} disabled={rows.length === 0} data-testid="people-export-csv-button">
        <Download className="size-3.5" />
        Export CSV
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => window.print()} disabled={rows.length === 0} data-testid="people-print-button">
        <Printer className="size-3.5" />
        Print
      </Button>
    </div>
  );
}
