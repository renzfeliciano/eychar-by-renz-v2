import Link from "next/link";
import { UserPlus, Users2 } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { EmploymentTypeService } from "@/domains/catalog/employment-type-service";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableSearchInput } from "@/components/shared/table-search-input";
import { buttonVariants } from "@/components/ui/button";
import { calculateAge, formatLengthOfService } from "@/lib/employee-dates";
import { formatPersonName } from "@/lib/person-name";
import { parseTableQuery, applyTableQuery, buildTableHref } from "@/lib/table-query";
import { PeopleFilters } from "./people-filters";
import { PeopleExportActions, type PeopleExportRow } from "./people-export-actions";
import { PeoplePrintReport } from "./people-print-report";

type SearchParams = Record<string, string | string[] | undefined>;

// Mirrors StatusBadge's tone-by-status convention so the summary dots and
// the table's own badges never disagree about what color a status is.
const STATUS_DOT_TONE: Record<string, string> = {
  active: "bg-success",
  on_leave: "bg-warning",
  terminated: "bg-destructive",
  resigned: "bg-muted-foreground",
  awol: "bg-destructive",
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PeoplePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("employees.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view employees.</p>;
  }

  const [fullRoster, positions, projects, employmentTypes, employmentStatuses] = await Promise.all([
    EmployeeService.listWithCurrentStatus(organizationId),
    PositionService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
    EmploymentTypeService.listCurrent(organizationId),
    EmploymentStatusService.listCurrent(organizationId),
  ]);
  const positionTitleById = new Map(positions.map((position) => [position._id.toString(), position.title]));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const statusNameByCode = new Map(employmentStatuses.map((item) => [item.code, item.name]));

  const employmentTypeFilter = firstValue(params.employmentType);
  const roster = employmentTypeFilter
    ? fullRoster.filter((row) => row.currentEmployment?.employmentType === employmentTypeFilter)
    : fullRoster;

  const tableQuery = parseTableQuery(params, "name");
  const { rows: pageRows, total: matchingTotal } = applyTableQuery(roster, tableQuery, {
    searchFields: (row) => [
      row.person ? formatPersonName(row.person) : null,
      row.employeeNumber,
      row.currentAssignment?.positionId ? (positionTitleById.get(row.currentAssignment.positionId.toString()) ?? null) : null,
    ],
    sortValues: {
      name: (row) => (row.person ? formatPersonName(row.person) : ""),
      employeeNumber: (row) => row.employeeNumber ?? "",
      status: (row) => (row.currentEmployment?.status ? (statusNameByCode.get(row.currentEmployment.status) ?? row.currentEmployment.status) : ""),
      age: (row) => (row.person?.birthDate ? calculateAge(new Date(row.person.birthDate)) : null),
      lengthOfService: (row) => (row.currentEmployment?.effectiveFrom ? new Date(row.currentEmployment.effectiveFrom) : null),
    },
  });

  // Always reflects the whole roster, independent of the employment-type
  // filter below — a summary that shifted with the table would misreport
  // "how many people work here" the moment someone filters it.
  const statusCounts = new Map<string, number>();
  for (const row of fullRoster) {
    const code = row.currentEmployment?.status;
    if (code) statusCounts.set(code, (statusCounts.get(code) ?? 0) + 1);
  }
  const statusSummary = employmentStatuses
    .filter((status) => statusCounts.has(status.code))
    .map((status) => ({ code: status.code, name: status.name, count: statusCounts.get(status.code)! }));

  const exportRows: PeopleExportRow[] = roster.map((row) => {
    const dateHired = row.currentEmployment?.effectiveFrom;
    const birthDate = row.person?.birthDate;
    return {
      employeeNumber: row.employeeNumber ?? "—",
      name: row.person ? formatPersonName(row.person) : "—",
      gender: row.person?.gender ?? "",
      position: row.currentAssignment?.positionId ? positionTitleById.get(row.currentAssignment.positionId.toString()) ?? "—" : "—",
      project: row.currentAssignment?.projectId ? projectNameById.get(row.currentAssignment.projectId.toString()) ?? "—" : "—",
      employmentStatus: row.currentEmployment ? statusNameByCode.get(row.currentEmployment.status) ?? row.currentEmployment.status : "—",
      age: birthDate ? String(calculateAge(new Date(birthDate))) : "",
      lengthOfService: dateHired ? formatLengthOfService(new Date(dateHired)) : "—",
      dateHired: dateHired ? new Date(dateHired).toLocaleDateString() : "",
      birthDate: birthDate ? new Date(birthDate).toLocaleDateString() : "",
      contactNumber: row.person?.phone ?? "",
      address: row.person?.address ?? "",
      sssNumber: row.person?.sssNumber ?? "",
      philHealthNumber: row.person?.philHealthNumber ?? "",
      pagIbigNumber: row.person?.pagIbigNumber ?? "",
      tinNumber: row.person?.tinNumber ?? "",
    };
  });

  return (
    <>
      <div className="flex flex-col gap-6 print:hidden">
        <PageHeader
          title="Employee roster"
          description="Search and manage every employee — statutory IDs are included in exports and prints."
          action={
            <div className="flex items-center gap-2">
              <PeopleExportActions rows={exportRows} />
              <Link href="/people/new" className={buttonVariants()}>
                <UserPlus className="size-4" />
                Add employee
              </Link>
            </div>
          }
        />

        {statusSummary.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm shadow-[var(--shadow-soft)]">
            <span className="flex items-center gap-2 font-semibold">
              <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                <Users2 className="size-3.5" />
              </span>
              {fullRoster.length} employee{fullRoster.length === 1 ? "" : "s"}
            </span>
            <span aria-hidden="true" className="h-4 w-px bg-border" />
            {statusSummary.map((status) => (
              <span key={status.code} className="flex items-center gap-1.5 text-muted-foreground">
                <span aria-hidden="true" className={`size-2 rounded-full ${STATUS_DOT_TONE[status.code] ?? "bg-muted-foreground"}`} />
                {status.name} <span className="font-medium text-foreground">{status.count}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-[var(--shadow-soft)] sm:flex-row sm:items-end">
          <TableSearchInput placeholder="Search by name, employee #, or position…" />
          <span aria-hidden="true" className="hidden h-9 w-px bg-border sm:block" />
          <PeopleFilters employmentTypes={employmentTypes.map((item) => ({ id: item.code, label: item.name }))} />
        </div>

        <DataTable
          sort={{
            sortBy: tableQuery.sort,
            sortDir: tableQuery.dir,
            buildHref: (sortKey) =>
              buildTableHref("/people", params, {
                sort: sortKey,
                dir: tableQuery.sort === sortKey && tableQuery.dir === "asc" ? "desc" : "asc",
                page: undefined,
              }),
          }}
          pagination={{
            page: tableQuery.page,
            pageSize: tableQuery.pageSize,
            total: matchingTotal,
            buildHref: (page, pageSize) => buildTableHref("/people", params, { page, pageSize }),
          }}
          columns={[
            {
              key: "name",
              header: "Name",
              sortKey: "name",
              // Pinned so the one column that identifies each row survives
              // scrolling right through position/project/tenure — otherwise
              // every column past "Employee #" is anonymous while scrolled.
              className: "sticky left-0 z-10 border-r bg-card",
              render: (row) => (
                <Link href={`/people/${row._id.toString()}`} className="font-medium text-primary hover:underline">
                  {row.person ? formatPersonName(row.person) : "—"}
                </Link>
              ),
            },
            { key: "employeeNumber", header: "Employee #", sortKey: "employeeNumber", render: (row) => row.employeeNumber ?? "—" },
            { key: "status", header: "Employment status", sortKey: "status", render: (row) => <StatusBadge status={row.currentEmployment?.status} /> },
            {
              key: "position",
              header: "Position",
              render: (row) =>
                row.currentAssignment?.positionId ? positionTitleById.get(row.currentAssignment.positionId.toString()) ?? "—" : "—",
            },
            {
              key: "project",
              header: "Project",
              render: (row) =>
                row.currentAssignment?.projectId ? projectNameById.get(row.currentAssignment.projectId.toString()) ?? "—" : "—",
            },
            {
              key: "age",
              header: "Age",
              sortKey: "age",
              render: (row) => (row.person?.birthDate ? calculateAge(new Date(row.person.birthDate)) : "—"),
            },
            {
              key: "lengthOfService",
              header: "Length of service",
              sortKey: "lengthOfService",
              render: (row) => (row.currentEmployment?.effectiveFrom ? formatLengthOfService(new Date(row.currentEmployment.effectiveFrom)) : "—"),
            },
          ]}
          rows={pageRows}
          getRowKey={(row) => row._id.toString()}
          emptyMessage={tableQuery.q || employmentTypeFilter ? "No employees match this search." : "No employees yet."}
        />
      </div>
      <PeoplePrintReport rows={exportRows} />
    </>
  );
}
