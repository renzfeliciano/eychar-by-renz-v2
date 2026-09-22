import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { LeaveRequestService } from "@/domains/leave/leave-request-service";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { formatPersonName as employeeName } from "@/lib/person-name";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableSearchInput } from "@/components/shared/table-search-input";
import { parseTableQuery, applyTableQuery, buildTableHref } from "@/lib/table-query";
import { NewRequestDialog } from "./new-request-dialog";
import { DecideActions } from "./decide-actions";

type SearchParams = Record<string, string | string[] | undefined>;

function formatDate(value: Date): string {
  return new Date(value).toISOString().slice(0, 10);
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

  const tableQuery = parseTableQuery(params, "startDate");
  const { rows: pageRows, total } = applyTableQuery(requests, tableQuery, {
    searchFields: (request) => [
      employeeName(employeeById.get(request.employeeId.toString())?.person ?? null),
      leaveTypeNameById.get(request.leaveTypeId.toString()),
    ],
    sortValues: {
      employee: (request) => employeeName(employeeById.get(request.employeeId.toString())?.person ?? null),
      startDate: (request) => new Date(request.startDate),
      days: (request) => request.totalDays,
      status: (request) => request.status,
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leave requests"
        description="Leave requested on behalf of employees, with approve/reject/cancel workflow."
        action={
          canCreate ? (
            <NewRequestDialog
              organizationId={organizationId}
              employees={employees.map((employee) => ({ id: employee._id.toString(), label: employeeName(employee.person) }))}
              leaveTypes={leaveTypes.map((leaveType) => ({ id: leaveType._id.toString(), label: leaveType.name }))}
            />
          ) : undefined
        }
      />

      <TableSearchInput placeholder="Search by employee or leave type…" />

      <DataTable
        sort={{
          sortBy: tableQuery.sort,
          sortDir: tableQuery.dir,
          buildHref: (sortKey) =>
            buildTableHref("/leave", params, {
              sort: sortKey,
              dir: tableQuery.sort === sortKey && tableQuery.dir === "asc" ? "desc" : "asc",
              page: undefined,
            }),
        }}
        pagination={{
          page: tableQuery.page,
          pageSize: tableQuery.pageSize,
          total,
          buildHref: (page, pageSize) => buildTableHref("/leave", params, { page, pageSize }),
        }}
        columns={[
          {
            key: "employee",
            header: "Employee",
            sortKey: "employee",
            render: (request) => employeeName(employeeById.get(request.employeeId.toString())?.person ?? null),
          },
          { key: "leaveType", header: "Leave type", render: (request) => leaveTypeNameById.get(request.leaveTypeId.toString()) ?? "—" },
          { key: "dates", header: "Dates", sortKey: "startDate", render: (request) => `${formatDate(request.startDate)} – ${formatDate(request.endDate)}` },
          { key: "days", header: "Days", sortKey: "days", render: (request) => request.totalDays },
          { key: "status", header: "Status", sortKey: "status", render: (request) => <StatusBadge status={request.status} /> },
          {
            key: "action",
            header: "",
            render: (request) => (
              <DecideActions
                requestId={request._id.toString()}
                organizationId={organizationId}
                status={request.status}
                canApprove={canApprove}
                canCancel={canCancel}
              />
            ),
          },
        ]}
        rows={pageRows}
        getRowKey={(request) => request._id.toString()}
        emptyMessage={tableQuery.q ? "No leave requests match this search." : "No leave requests yet."}
      />
    </div>
  );
}
