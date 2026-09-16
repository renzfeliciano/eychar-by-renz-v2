import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreateLeaveTypeForm } from "./create-leave-type-form";

export default async function LeaveTypesPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("leave-types.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view leave types.</p>;
  }

  const leaveTypes = await LeaveTypeService.listCurrent(organizationId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Leave types" description="The configurable catalog of leave an organization offers." />
      <CreateLeaveTypeForm organizationId={organizationId} />
      <DataTable
        columns={[
          { key: "name", header: "Name", render: (leaveType) => <span className="font-medium">{leaveType.name}</span> },
          { key: "code", header: "Code", render: (leaveType) => leaveType.code },
          { key: "description", header: "Description", render: (leaveType) => leaveType.description ?? "—" },
          {
            key: "approval",
            header: "Requires approval",
            render: (leaveType) => (leaveType.requiresApproval ? "Yes" : "No"),
          },
          { key: "status", header: "Status", render: (leaveType) => <StatusBadge status={leaveType.status} /> },
        ]}
        rows={leaveTypes}
        getRowKey={(leaveType) => leaveType._id.toString()}
        emptyMessage="No leave types yet."
      />
    </div>
  );
}
