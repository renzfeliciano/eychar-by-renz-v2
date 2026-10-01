import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, ChevronLeft, ChevronRight, Hourglass, UserX, Users } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { LeaveBalanceService, type LeaveBalanceSummary } from "@/domains/leave/leave-balance-service";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { ProjectService } from "@/domains/organization/project-service";
import { loadCurrentStaffCheck } from "@/domains/attendance/current-staff";
import { projectsAsOf } from "@/domains/payroll/payroll-scope";
import { formatPersonName } from "@/lib/person-name";
import { localDateKey } from "@/lib/date-key";
import { parseTableQuery, applyTableQuery, buildTableHref } from "@/lib/table-query";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { TableSearchInput } from "@/components/shared/table-search-input";
import { MetricCard } from "@/components/shared/metric-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CreateLeaveBalanceDialog } from "./create-leave-balance-dialog";
import { EmployeeBalanceSheet } from "./employee-balance-sheet";
import { formatDays, UsageBar } from "./usage-bar";

export const metadata: Metadata = { title: "Leave balances" };

type SearchParams = Record<string, string | string[] | undefined>;

type Row = {
  _id: string;
  employeeId: string;
  name: string;
  employeeNumber: string;
  projectName: string | null;
  balances: Map<string, LeaveBalanceSummary>;
};

export default async function LeaveBalancesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("leave-balances.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view leave balances.</p>;
  }

  const today = localDateKey();
  const currentYear = Number(today.slice(0, 4));
  const requestedYear = Number(Array.isArray(params.year) ? params.year[0] : params.year);
  const year = Number.isInteger(requestedYear) && requestedYear > 2000 && requestedYear < 2100 ? requestedYear : currentYear;

  const [canCreate, canUpdate, summary, leaveTypes, roster, isCurrentStaff, projects] = await Promise.all([
    hasPermission("leave-balances.create", organizationId),
    hasPermission("leave-balances.update", organizationId),
    LeaveBalanceService.summarizeForYear(organizationId, year),
    LeaveTypeService.listCurrent(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
    loadCurrentStaffCheck(organizationId),
    ProjectService.listCurrent(organizationId),
  ]);

  // Columns: active leave types, plus retired ones still holding balances this year.
  const typesWithBalances = new Set(summary.map((line) => line.leaveTypeId));
  const columnTypes = leaveTypes.filter((type) => type.status === "active" || typesWithBalances.has(type._id.toString()));
  const balancesByEmployee = new Map<string, Map<string, LeaveBalanceSummary>>();
  for (const line of summary) {
    const map = balancesByEmployee.get(line.employeeId) ?? new Map<string, LeaveBalanceSummary>();
    map.set(line.leaveTypeId, line);
    balancesByEmployee.set(line.employeeId, map);
  }

  // One row per employee: current staff, plus anyone with a balance in the year shown.
  const employees = roster.filter((row) => isCurrentStaff(row.currentEmployment?.status) || balancesByEmployee.has(row._id.toString()));
  const projectByEmployee = await projectsAsOf(employees.map((row) => row._id.toString()), today);
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const rows: Row[] = employees.map((employee) => {
    const employeeId = employee._id.toString();
    const projectId = projectByEmployee.get(employeeId);
    return {
      _id: employeeId,
      employeeId,
      name: formatPersonName(employee.person),
      employeeNumber: employee.employeeNumber,
      projectName: projectId ? (projectNameById.get(projectId) ?? null) : null,
      balances: balancesByEmployee.get(employeeId) ?? new Map(),
    };
  });

  const tableQuery = parseTableQuery(params, "name");
  const { rows: pageRows, total } = applyTableQuery(rows, tableQuery, {
    searchFields: (row) => [row.name, row.employeeNumber, row.projectName],
    sortValues: {
      name: (row) => row.name,
      ...Object.fromEntries(
        columnTypes.map((type) => [
          `type-${type._id.toString()}`,
          (row: Row) => {
            const line = row.balances.get(type._id.toString());
            return line ? (line.unlimited ? Number.MAX_SAFE_INTEGER : (line.availableDays ?? 0)) : -1;
          },
        ]),
      ),
    },
  });

  const employeeOptions = employees.map((employee) => ({ id: employee._id.toString(), label: formatPersonName(employee.person) }));
  const leaveTypeOptions = leaveTypes.filter((type) => type.status === "active").map((type) => ({ id: type._id.toString(), label: type.name }));
  const covered = rows.filter((row) => row.balances.size > 0).length;
  const missing = rows.filter((row) => row.balances.size === 0).length;
  const yearHref = (target: number) => buildTableHref("/leave/balances", params, { year: target === currentYear ? undefined : target, page: undefined });

  const columns: DataTableColumn<Row>[] = [
    {
      key: "name",
      header: "Employee",
      sortKey: "name",
      className: "sticky left-0 z-10 min-w-56 border-r bg-card",
      render: (row) => (
        <EmployeeBalanceSheet
          organizationId={organizationId}
          employeeId={row.employeeId}
          employeeName={row.name}
          employeeNumber={row.employeeNumber}
          projectName={row.projectName}
          year={year}
          employees={employeeOptions}
          leaveTypes={leaveTypeOptions}
          canCreate={canCreate}
          canUpdate={canUpdate}
          lines={columnTypes.map((type) => {
            const line = row.balances.get(type._id.toString());
            return {
              leaveTypeId: type._id.toString(),
              leaveTypeName: type.name,
              balance: line
                ? {
                    balanceId: line.balanceId,
                    entitledDays: line.entitledDays,
                    adjustmentDays: line.adjustmentDays,
                    usedDays: line.usedDays,
                    pendingDays: line.pendingDays,
                    availableDays: line.availableDays,
                    unlimited: line.unlimited,
                  }
                : null,
            };
          })}
        />
      ),
    },
    ...columnTypes.map<DataTableColumn<Row>>((type) => ({
      key: `type-${type._id.toString()}`,
      header: type.name,
      sortKey: `type-${type._id.toString()}`,
      className: "min-w-36",
      render: (row) => {
        const line = row.balances.get(type._id.toString());
        if (!line) {
          return canCreate && type.status === "active" ? (
            <CreateLeaveBalanceDialog
              organizationId={organizationId}
              employees={employeeOptions}
              leaveTypes={leaveTypeOptions}
              year={year}
              employeeId={row.employeeId}
              leaveTypeId={type._id.toString()}
              variant="cell"
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        }
        if (line.unlimited) {
          return (
            <div className="flex flex-col gap-0.5">
              <span className="w-fit rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Unlimited</span>
              <span className="text-xs text-muted-foreground">{formatDays(line.usedDays)} used</span>
            </div>
          );
        }
        const totalDays = line.entitledDays + line.adjustmentDays;
        const available = line.availableDays ?? 0;
        return (
          <div className="flex w-32 flex-col gap-1">
            <div className="flex items-baseline gap-1">
              <span className={cn("text-base font-semibold tabular-nums", available < 0 && "text-destructive")}>{formatDays(available)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">/ {formatDays(totalDays)}</span>
            </div>
            <UsageBar used={line.usedDays} pending={line.pendingDays} total={totalDays} />
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {formatDays(line.usedDays)} used{line.pendingDays ? ` · ${formatDays(line.pendingDays)} pending` : ""}
            </span>
          </div>
        );
      },
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leave balances"
        description="Every employee's leave for the year at a glance: days left, used and pending per leave type. Open a name for the full breakdown."
        action={
          canCreate ? (
            <CreateLeaveBalanceDialog organizationId={organizationId} employees={employeeOptions} leaveTypes={leaveTypeOptions} year={year} />
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Employees covered" value={`${covered} / ${rows.length}`} hint={`With a ${year} balance`} icon={Users} />
        <MetricCard label="Days used" value={formatDays(summary.reduce((sum, line) => sum + line.usedDays, 0))} hint={`Approved leave in ${year}`} icon={CalendarCheck} />
        <MetricCard label="Days pending" value={formatDays(summary.reduce((sum, line) => sum + line.pendingDays, 0))} hint="Awaiting approval" icon={Hourglass} />
        <MetricCard label="Without balances" value={missing} hint={missing ? "Grant them to allow requests" : "Everyone is set up"} icon={UserX} tone={missing ? "warning" : "success"} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TableSearchInput placeholder="Find by name, employee # or project" />
          <nav aria-label="Year" className="flex items-center gap-1">
            <Link href={yearHref(year - 1)} className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))} aria-label={`Show ${year - 1}`}>
              <ChevronLeft className="size-4" />
            </Link>
            <span className="min-w-16 text-center text-sm font-semibold tabular-nums" aria-live="polite">
              {year}
            </span>
            <Link href={yearHref(year + 1)} className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))} aria-label={`Show ${year + 1}`}>
              <ChevronRight className="size-4" />
            </Link>
          </nav>
        </div>

        <div className="[&_[data-slot=table-container]]:overflow-x-auto">
          <DataTable
            caption={`Leave balances for ${year}`}
            sort={{
              sortBy: tableQuery.sort,
              sortDir: tableQuery.dir,
              buildHref: (sortKey) => buildTableHref("/leave/balances", params, { sort: sortKey, dir: tableQuery.sort === sortKey && tableQuery.dir === "asc" ? "desc" : "asc", page: undefined }),
            }}
            pagination={{ page: tableQuery.page, pageSize: tableQuery.pageSize, total, buildHref: (page, pageSize) => buildTableHref("/leave/balances", params, { page, pageSize }) }}
            columns={columns}
            rows={pageRows}
            getRowKey={(row) => row.employeeId}
            emptyMessage={columnTypes.length === 0 ? "Add leave types first, then grant balances." : "No employees match."}
          />
        </div>
        <p className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full bg-primary" aria-hidden="true" /> Used
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full bg-primary/35" aria-hidden="true" /> Pending
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full bg-muted" aria-hidden="true" /> Left
          </span>
        </p>
      </div>
    </div>
  );
}
