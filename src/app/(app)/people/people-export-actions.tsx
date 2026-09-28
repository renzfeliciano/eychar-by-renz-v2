"use client";

import { TableExportActions } from "@/components/shared/table-export-actions";
import type { TableExportSpec } from "@/lib/export/table-export";

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

const PEOPLE_EXPORT: TableExportSpec<PeopleExportRow> = {
  title: "Employee roster",
  sheetName: "Employees",
  noun: ["employee", "employees"],
  columns: [
    { header: "Employee number", width: 16, value: (row) => row.employeeNumber },
    { header: "Employee name", width: 28, value: (row) => row.name },
    { header: "Gender", width: 10, value: (row) => row.gender },
    { header: "Position", width: 22, value: (row) => row.position },
    { header: "Project/site", width: 22, value: (row) => row.project },
    { header: "Employment status", width: 18, value: (row) => row.employmentStatus },
    { header: "Age", width: 6, value: (row) => (row.age ? Number(row.age) : null) },
    { header: "Length of service", width: 18, value: (row) => row.lengthOfService },
    { header: "Date hired", width: 12, value: (row) => row.dateHired },
    { header: "Birth date", width: 12, value: (row) => row.birthDate },
    { header: "Contact number", width: 16, value: (row) => row.contactNumber },
    { header: "Address", width: 40, wrap: true, value: (row) => row.address },
    { header: "SSS no", width: 15, value: (row) => row.sssNumber },
    { header: "PhilHealth no", width: 16, value: (row) => row.philHealthNumber },
    { header: "Pag-IBIG no", width: 16, value: (row) => row.pagIbigNumber },
    { header: "TIN no", width: 16, value: (row) => row.tinNumber },
  ],
};

export function PeopleExportActions({ rows, organizationName }: { rows: PeopleExportRow[]; organizationName: string }) {
  return (
    <TableExportActions
      spec={PEOPLE_EXPORT}
      rows={rows}
      organizationName={organizationName}
      fileKey="employees"
      testIdPrefix="people"
      note="It includes statutory IDs and contact details, so share it only with people who need them."
    />
  );
}
