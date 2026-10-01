"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { TableExportActions } from "@/components/shared/table-export-actions";
import type { RosterExportRow } from "@/domains/workforce/employee-roster-service";
import { PeoplePrintReport } from "./people-print-report";
import type { TableExportSpec } from "@/lib/export/table-export";

// Built on the server (EmployeeRosterService.exportRows) and fetched on demand.
export type PeopleExportRow = RosterExportRow;

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

/**
 * The roster (with contact details and statutory IDs) is fetched only when
 * someone exports or prints, from an audited, rate-limited endpoint, rather
 * than sent to the browser with every view of the People page.
 */
export function PeopleExportActions({
  organizationId,
  organizationName,
  employmentType,
  count,
}: {
  organizationId: string;
  organizationName: string;
  employmentType?: string;
  count: number;
}) {
  const [printRows, setPrintRows] = useState<PeopleExportRow[] | null>(null);
  const [printing, setPrinting] = useState(false);

  async function loadRows(): Promise<PeopleExportRow[]> {
    const params = new URLSearchParams({ organizationId });
    if (employmentType) params.set("employmentType", employmentType);
    const response = await fetch(`/api/employees/export?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Export failed (${response.status})`);
    return ((await response.json()) as { rows: PeopleExportRow[] }).rows;
  }

  async function print() {
    try {
      setPrintRows(await loadRows());
      setPrinting(true);
    } catch {
      toast.error("Couldn't prepare the roster for printing. Please try again.");
    }
  }

  // Print once the report has rendered, then drop the rows from the page.
  useEffect(() => {
    if (!printing) return;
    const clear = () => {
      setPrinting(false);
      setPrintRows(null);
    };
    window.addEventListener("afterprint", clear, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", clear);
  }, [printing]);

  return (
    <>
      <TableExportActions
        spec={PEOPLE_EXPORT}
        loadRows={loadRows}
        count={count}
        onPrint={() => void print()}
        organizationName={organizationName}
        fileKey="employees"
        testIdPrefix="people"
        note="It includes statutory IDs and contact details, so share it only with people who need them."
      />
      {printRows && createPortal(<PeoplePrintReport rows={printRows} />, document.body)}
    </>
  );
}
