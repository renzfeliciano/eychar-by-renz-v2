import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, IdCard, UserPlus, Users2 } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { EmployeeRosterService } from "@/domains/workforce/employee-roster-service";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { EmploymentTypeService } from "@/domains/catalog/employment-type-service";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableSearchInput } from "@/components/shared/table-search-input";
import { MetricCard } from "@/components/shared/metric-card";
import { buttonVariants } from "@/components/ui/button";
import { calculateAge, formatLengthOfService } from "@/lib/employee-dates";
import { formatPersonName } from "@/lib/person-name";
import { parseTableQuery, buildTableHref } from "@/lib/table-query";
import { PeopleFilters } from "./people-filters";
import { PeopleExportActions } from "./people-export-actions";
import { NoAccessState } from "@/components/shared/no-access-state";

export const metadata: Metadata = { title: "People" };

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
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("employees.read", organizationId))) {
    return <NoAccessState permission="employees.read" message="You don't have access to view employees." />;
  }

  const [positions, projects, employmentTypes, employmentStatuses] = await Promise.all([
    PositionService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
    EmploymentTypeService.listCurrent(organizationId),
    EmploymentStatusService.listCurrent(organizationId),
  ]);
  const positionTitleById = new Map(positions.map((position) => [position._id.toString(), position.title]));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const statusNameByCode = new Map(employmentStatuses.map((item) => [item.code, item.name]));

  const employmentTypeFilter = firstValue(params.employmentType);
  const tableQuery = parseTableQuery(params, "name");
  const needle = tableQuery.q?.toLowerCase();
  // Only one page of people is read; the database searches, sorts and counts.
  // The summary strip always reflects the whole roster, independent of the
  // employment-type filter — a summary that shifted with the table would
  // misreport "how many people work here" the moment someone filters it.
  const activeCodes = new Set(employmentStatuses.filter((status) => status.metadata?.isActiveHeadcount).map((status) => status.code));
  const [{ rows: pageRows, total: matchingTotal }, summary, filteredTotal] = await Promise.all([
    EmployeeRosterService.page(organizationId, {
      ...tableQuery,
      employmentType: employmentTypeFilter,
      positionIdsMatchingQ: needle ? positions.filter((position) => position.title.toLowerCase().includes(needle)).map((position) => position._id.toString()) : undefined,
      statusNames: statusNameByCode,
    }),
    EmployeeRosterService.summary(organizationId, activeCodes),
    // How many rows an export would hold (it ignores the search box, as before).
    tableQuery.q ? EmployeeRosterService.page(organizationId, { ...tableQuery, q: undefined, page: 1, pageSize: 1, employmentType: employmentTypeFilter }).then((result) => result.total) : null,
  ]);
  const exportCount = filteredTotal ?? matchingTotal;

  const statusSummary = employmentStatuses
    .filter((status) => summary.statusCounts.has(status.code))
    .map((status) => ({ code: status.code, name: status.name, count: summary.statusCounts.get(status.code)! }));
  const { newHires, endingSoon, missingIds } = summary;

  return (
    <>
      <div className="flex flex-col gap-6 print:hidden">
        <PageHeader
          title="Employee roster"
          description="Search and manage every employee — statutory IDs are included in exports and prints."
          action={
            <div className="flex items-center gap-2">
              <PeopleExportActions organizationId={organizationId} organizationName={organization.name} employmentType={employmentTypeFilter} count={exportCount} />
              <Link href="/people/new" className={buttonVariants()}>
                <UserPlus className="size-4" />
                Add employee
              </Link>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            label="Active headcount"
            value={summary.headcount}
            hint={
              <span className="flex items-center gap-2">
                {statusSummary.slice(0, 3).map((status) => (
                  <span key={status.code} className="flex items-center gap-1">
                    <span aria-hidden="true" className={`size-1.5 rounded-full ${STATUS_DOT_TONE[status.code] ?? "bg-muted-foreground"}`} />
                    {status.name} {status.count}
                  </span>
                ))}
              </span>
            }
            icon={Users2}
            emphasis
          />
          <MetricCard label="New hires" value={newHires} hint="In the last 90 days" icon={UserPlus} />
          <MetricCard label="Contracts ending" value={endingSoon} hint="In the next 30 days" icon={CalendarClock} tone={endingSoon ? "warning" : "default"} />
          <MetricCard
            label="Incomplete gov't IDs"
            value={missingIds}
            hint={missingIds ? "Missing SSS, PhilHealth, Pag-IBIG or TIN" : "All IDs on file"}
            icon={IdCard}
            tone={missingIds ? "warning" : "success"}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-[var(--shadow-soft)] sm:flex-row sm:items-end">
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
              render: (row) => {
                const name = row.person ? formatPersonName(row.person) : "—";
                return (
                  <Link href={`/people/${row._id.toString()}`} className="group flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">
                      {name
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-foreground group-hover:text-primary group-hover:underline">{name}</span>
                      {row.person?.email && <span className="truncate text-xs text-muted-foreground">{row.person.email}</span>}
                    </span>
                  </Link>
                );
              },
            },
            { key: "employeeNumber", header: "Employee #", mobile: "subtitle", sortKey: "employeeNumber", render: (row) => row.employeeNumber ?? "—" },
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
              header: "Age", mobile: "hidden",
              sortKey: "age",
              render: (row) => (row.person?.birthDate ? calculateAge(new Date(row.person.birthDate)) : "—"),
            },
            {
              key: "lengthOfService",
              header: "Length of service", mobile: "hidden",
              sortKey: "lengthOfService",
              render: (row) => (row.currentEmployment?.effectiveFrom ? formatLengthOfService(new Date(row.currentEmployment.effectiveFrom)) : "—"),
            },
          ]}
          rows={pageRows}
          getRowKey={(row) => row._id.toString()}
          emptyMessage={tableQuery.q || employmentTypeFilter ? "No employees match this search." : "No employees yet."}
        />
      </div>
    </>
  );
}
