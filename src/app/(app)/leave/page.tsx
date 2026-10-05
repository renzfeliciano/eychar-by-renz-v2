import type { Metadata } from "next";

import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { LeaveRequestService } from "@/domains/leave/leave-request-service";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { formatPersonName as employeeName } from "@/lib/person-name";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard, MetricStrip } from "@/components/shared/metric-card";
import { StatusFilterTabs } from "@/components/shared/status-filter-tabs";
import { TableSearchInput } from "@/components/shared/table-search-input";
import { parseTableQuery, buildTableHref } from "@/lib/table-query";
import { NewRequestDialog } from "./new-request-dialog";
import { DecideActions } from "./decide-actions";
import { NoAccessState } from "@/components/shared/no-access-state";

export const metadata: Metadata = { title: "Leave requests" };

type SearchParams = Record<string, string | string[] | undefined>;

const STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;

function formatRange(start: Date, end: Date): string {
  const from = new Date(start);
  const to = new Date(end);
  const sameDay = from.toISOString().slice(0, 10) === to.toISOString().slice(0, 10);
  const short = { month: "short", day: "numeric", timeZone: "UTC" } as const;
  if (sameDay) return from.toLocaleDateString("en-US", { ...short, year: "numeric" });
  return `${from.toLocaleDateString("en-US", short)} – ${to.toLocaleDateString("en-US", { ...short, year: "numeric" })}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default async function LeavePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("leave.read", organizationId))) {
    return <NoAccessState permission="leave.read" message="You don't have access to view leave requests." />;
  }

  const [canCreate, canApprove, canCancel] = await Promise.all([
    hasPermission("leave.create", organizationId),
    hasPermission("leave.approve", organizationId),
    hasPermission("leave.update", organizationId),
  ]);

  const statusFilter = (STATUSES as readonly string[]).includes(String(params.status)) ? String(params.status) : "all";
  const tableQuery = parseTableQuery(params, "startDate");

  const [leaveTypes, employees] = await Promise.all([LeaveTypeService.listCurrent(organizationId), EmployeeService.listWithCurrentStatus(organizationId)]);
  const leaveTypeNameById = new Map(leaveTypes.map((leaveType) => [leaveType._id.toString(), leaveType.name]));
  const employeeById = new Map(employees.map((employee) => [employee._id.toString(), employee]));

  // Search and the employee-name sort work on names, which live outside
  // leave requests: resolve them to ids here, then let the database filter,
  // sort, count and page (only one page of requests is read).
  const needle = tableQuery.q?.toLowerCase();
  const nameOf = (employee: (typeof employees)[number]) => employeeName(employee.person);
  // Ranks for the employee sort: distinct names in order; a request whose
  // employee isn't on the roster sorts as "—", the name the table shows.
  const missingName = employeeName(null);
  const names = tableQuery.sort === "employee" ? [...new Set([...employees.map(nameOf), missingName])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) : [];
  const rankOfName = new Map(names.map((name, index) => [name, index]));
  const [{ rows: pageRows, total }, summary] = await Promise.all([
    LeaveRequestService.page(organizationId, {
      ...tableQuery,
      status: statusFilter === "all" ? undefined : statusFilter,
      employeeIdsMatchingQ: needle ? employees.filter((employee) => nameOf(employee).toLowerCase().includes(needle)).map((employee) => employee._id.toString()) : undefined,
      leaveTypeIdsMatchingQ: needle ? leaveTypes.filter((leaveType) => leaveType.name.toLowerCase().includes(needle)).map((leaveType) => leaveType._id.toString()) : undefined,
      employeeOrder:
        tableQuery.sort === "employee"
          ? { ids: employees.map((employee) => employee._id.toString()), ranks: employees.map((employee) => rankOfName.get(nameOf(employee))!), missingRank: rankOfName.get(missingName)! }
          : undefined,
    }),
    // Summary: what's waiting, who's out today, what's coming, and this month's approved days.
    LeaveRequestService.summary(organizationId, new Date()),
  ]);
  const pending = summary.byStatus.get("pending") ?? { count: 0, days: 0 };
  const { onLeaveToday, upcoming, approvedDaysThisMonth } = summary;

  const createAction = canCreate ? (
    <NewRequestDialog
      organizationId={organizationId}
      employees={employees.map((employee) => ({ id: employee._id.toString(), label: employeeName(employee.person) }))}
      leaveTypes={leaveTypes.map((leaveType) => ({ id: leaveType._id.toString(), label: leaveType.name }))}
    />
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Leave requests" description="Requests filed for employees, from request to approval, with balances checked on the way." action={createAction} />

      <MetricStrip columns={4}>
        <MetricCard
          label="Awaiting approval"
          value={pending.count}
          hint={`${pending.days} days requested`}
          tone={pending.count ? "warning" : "default"}
        />
        <MetricCard label="On leave today" value={onLeaveToday} hint="Approved leave covering today" emphasis />
        <MetricCard label="Starting soon" value={upcoming} hint="Approved, within 30 days" />
        <MetricCard label="Approved this month" value={approvedDaysThisMonth} hint="Days of leave" />
      </MetricStrip>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusFilterTabs
            basePath="/leave"
            params={params}
            active={statusFilter}
            options={[
              { value: "all", label: "All", count: summary.total },
              ...STATUSES.map((status) => ({ value: status, label: status.charAt(0).toUpperCase() + status.slice(1), count: summary.byStatus.get(status)?.count ?? 0 })),
            ]}
          />
          <TableSearchInput placeholder="Search by employee or leave type…" />
        </div>

        <DataTable
          caption="Leave requests"
          sort={{
            sortBy: tableQuery.sort,
            sortDir: tableQuery.dir,
            buildHref: (sortKey) => buildTableHref("/leave", params, { sort: sortKey, dir: tableQuery.sort === sortKey && tableQuery.dir === "asc" ? "desc" : "asc", page: undefined }),
          }}
          pagination={{ page: tableQuery.page, pageSize: tableQuery.pageSize, total, buildHref: (page, pageSize) => buildTableHref("/leave", params, { page, pageSize }) }}
          columns={[
            {
              key: "employee",
              header: "Employee",
              sortKey: "employee",
              render: (request) => {
                const employee = employeeById.get(request.employeeId.toString());
                const name = employeeName(employee?.person ?? null);
                return (
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground ring-1 ring-border" aria-hidden="true">
                      {initials(name)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{name}</span>
                      <span className="truncate text-xs text-muted-foreground">{employee?.employeeNumber}</span>
                    </span>
                  </div>
                );
              },
            },
            { key: "leaveType", header: "Leave type", render: (request) => leaveTypeNameById.get(request.leaveTypeId.toString()) ?? "—" },
            { key: "dates", header: "Dates", sortKey: "startDate", render: (request) => formatRange(request.startDate, request.endDate) },
            {
              key: "days",
              header: "Days",
              sortKey: "days",
              className: "text-right",
              render: (request) => <span className="font-medium tabular-nums">{request.totalDays}</span>,
            },
            { key: "status", header: "Status", sortKey: "status", render: (request) => <StatusBadge status={request.status} /> },
            {
              key: "action",
              header: "",
              className: "text-right",
              render: (request) => (
                <DecideActions requestId={request._id.toString()} organizationId={organizationId} status={request.status} canApprove={canApprove} canCancel={canCancel} />
              ),
            },
          ]}
          rows={pageRows}
          getRowKey={(request) => request._id.toString()}
          emptyMessage={tableQuery.q || statusFilter !== "all" ? "No leave requests match." : "No leave requests yet."}
          emptyDescription={tableQuery.q || statusFilter !== "all" ? undefined : "File a request for an employee; it goes to approval and is checked against their balance."}
          emptyAction={tableQuery.q || statusFilter !== "all" ? undefined : createAction}
        />
      </div>
    </div>
  );
}
