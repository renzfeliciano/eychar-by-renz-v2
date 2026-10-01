import type { Metadata } from "next";
import { CalendarCheck, CalendarClock, Hourglass, Palmtree } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { LeaveRequestService } from "@/domains/leave/leave-request-service";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { formatPersonName as employeeName } from "@/lib/person-name";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusFilterTabs } from "@/components/shared/status-filter-tabs";
import { TableSearchInput } from "@/components/shared/table-search-input";
import { parseTableQuery, applyTableQuery, buildTableHref } from "@/lib/table-query";
import { NewRequestDialog } from "./new-request-dialog";
import { DecideActions } from "./decide-actions";

export const metadata: Metadata = { title: "Leave requests" };

type SearchParams = Record<string, string | string[] | undefined>;

const STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
const DAY_MS = 86_400_000;

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
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("leave.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view leave requests.</p>;
  }

  const [canCreate, canApprove, canCancel] = await Promise.all([
    hasPermission("leave.create", organizationId),
    hasPermission("leave.approve", organizationId),
    hasPermission("leave.update", organizationId),
  ]);

  const [requests, leaveTypes, employees] = await Promise.all([
    LeaveRequestService.listForOrganization(organizationId),
    LeaveTypeService.listCurrent(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
  ]);
  const leaveTypeNameById = new Map(leaveTypes.map((leaveType) => [leaveType._id.toString(), leaveType.name]));
  const employeeById = new Map(employees.map((employee) => [employee._id.toString(), employee]));

  // Summary: what's waiting, who's out today, what's coming, and this month's approved days.
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const covers = (request: (typeof requests)[number], key: string) =>
    new Date(request.startDate).toISOString().slice(0, 10) <= key && new Date(request.endDate).toISOString().slice(0, 10) >= key;
  const pending = requests.filter((request) => request.status === "pending");
  const approved = requests.filter((request) => request.status === "approved");
  const onLeaveToday = new Set(approved.filter((request) => covers(request, todayKey)).map((request) => request.employeeId.toString())).size;
  const upcoming = approved.filter((request) => {
    const start = new Date(request.startDate).getTime();
    return start > today.getTime() && start - today.getTime() <= 30 * DAY_MS;
  }).length;
  const monthKey = todayKey.slice(0, 7);
  const approvedDaysThisMonth = approved.filter((request) => new Date(request.startDate).toISOString().startsWith(monthKey)).reduce((sum, request) => sum + request.totalDays, 0);

  const statusFilter = (STATUSES as readonly string[]).includes(String(params.status)) ? String(params.status) : "all";
  const visible = statusFilter === "all" ? requests : requests.filter((request) => request.status === statusFilter);

  const tableQuery = parseTableQuery(params, "startDate");
  const { rows: pageRows, total } = applyTableQuery(visible, tableQuery, {
    searchFields: (request) => [employeeName(employeeById.get(request.employeeId.toString())?.person ?? null), leaveTypeNameById.get(request.leaveTypeId.toString())],
    sortValues: {
      employee: (request) => employeeName(employeeById.get(request.employeeId.toString())?.person ?? null),
      startDate: (request) => new Date(request.startDate),
      days: (request) => request.totalDays,
      status: (request) => request.status,
    },
  });

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

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          label="Awaiting approval"
          value={pending.length}
          hint={`${pending.reduce((sum, request) => sum + request.totalDays, 0)} days requested`}
          icon={Hourglass}
          tone={pending.length ? "warning" : "default"}
        />
        <MetricCard label="On leave today" value={onLeaveToday} hint="Approved leave covering today" icon={Palmtree} emphasis />
        <MetricCard label="Starting soon" value={upcoming} hint="Approved, within 30 days" icon={CalendarClock} />
        <MetricCard label="Approved this month" value={approvedDaysThisMonth} hint="Days of leave" icon={CalendarCheck} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusFilterTabs
            basePath="/leave"
            params={params}
            active={statusFilter}
            options={[
              { value: "all", label: "All", count: requests.length },
              ...STATUSES.map((status) => ({ value: status, label: status.charAt(0).toUpperCase() + status.slice(1), count: requests.filter((request) => request.status === status).length })),
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
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">
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
