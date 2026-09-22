import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { LeaveTypeFormDialog } from "./leave-type-form-dialog";
import { DeleteLeaveTypeButton } from "./delete-leave-type-button";

export default async function LeaveTypesPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("leave-types.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view leave types.</p>;
  }

  const [canUpdate, canDelete] = await Promise.all([
    hasPermission("leave-types.update", organizationId),
    hasPermission("leave-types.delete", organizationId),
  ]);

  const leaveTypes = await LeaveTypeService.listCurrent(organizationId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leave types"
        description="The configurable catalog of leave an organization offers."
        action={<LeaveTypeFormDialog organizationId={organizationId} />}
      />
      <DataTable
        caption="Leave types"
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
          {
            key: "action",
            header: "",
            render: (leaveType) =>
              canUpdate || canDelete ? (
                <div className="flex items-center gap-1">
                  {canUpdate && (
                    <LeaveTypeFormDialog
                      organizationId={organizationId}
                      initialValue={{
                        id: leaveType._id.toString(),
                        name: leaveType.name,
                        code: leaveType.code,
                        description: leaveType.description,
                      }}
                    />
                  )}
                  {canDelete && <DeleteLeaveTypeButton id={leaveType._id.toString()} name={leaveType.name} organizationId={organizationId} />}
                </div>
              ) : null,
          },
        ]}
        rows={leaveTypes}
        getRowKey={(leaveType) => leaveType._id.toString()}
        emptyMessage="No leave types yet."
      />
    </div>
  );
}
