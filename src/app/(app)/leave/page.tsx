import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { LeaveRequestService } from "@/domains/leave/leave-request-service";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { formatPersonName as employeeName } from "@/lib/person-name";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { NewRequestDialog } from "./new-request-dialog";
import { DecideActions } from "./decide-actions";

function formatDate(value: Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

export default async function LeavePage() {
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

      <DataTable
        columns={[
          {
            key: "employee",
            header: "Employee",
            render: (request) => employeeName(employeeById.get(request.employeeId.toString())?.person ?? null),
          },
          { key: "leaveType", header: "Leave type", render: (request) => leaveTypeNameById.get(request.leaveTypeId.toString()) ?? "—" },
          { key: "dates", header: "Dates", render: (request) => `${formatDate(request.startDate)} – ${formatDate(request.endDate)}` },
          { key: "days", header: "Days", render: (request) => request.totalDays },
          { key: "status", header: "Status", render: (request) => <StatusBadge status={request.status} /> },
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
        rows={requests}
        getRowKey={(request) => request._id.toString()}
        emptyMessage="No leave requests yet."
      />
    </div>
  );
}
