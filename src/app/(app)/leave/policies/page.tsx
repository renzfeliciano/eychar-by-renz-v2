import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { LeavePolicyService } from "@/domains/leave/leave-policy-service";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { ProjectService } from "@/domains/organization/project-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreateLeavePolicyDialog } from "./create-leave-policy-dialog";

export default async function LeavePoliciesPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("leave-policies.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view leave policies.</p>;
  }

  const [policies, leaveTypes, projects] = await Promise.all([
    LeavePolicyService.listCurrent(organizationId),
    LeaveTypeService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
  ]);
  const leaveTypeNameById = new Map(leaveTypes.map((leaveType) => [leaveType._id.toString(), leaveType.name]));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leave policies"
        description="Annual entitlement per leave type, with optional project overrides."
        action={
          <CreateLeavePolicyDialog
            organizationId={organizationId}
            leaveTypes={leaveTypes.map((leaveType) => ({ id: leaveType._id.toString(), label: leaveType.name }))}
            projects={projects.map((project) => ({ id: project._id.toString(), label: project.name }))}
          />
        }
      />
      <DataTable
        caption="Leave policies"
        columns={[
          { key: "name", header: "Name", render: (policy) => <span className="font-medium">{policy.name}</span> },
          {
            key: "leaveType",
            header: "Leave type",
            render: (policy) => leaveTypeNameById.get(policy.leaveTypeId.toString()) ?? "—",
          },
          {
            key: "scope",
            header: "Scope",
            render: (policy) => (policy.projectId ? projectNameById.get(policy.projectId.toString()) ?? "—" : "Organization-wide"),
          },
          { key: "entitlement", header: "Annual days", render: (policy) => policy.annualEntitlementDays },
          { key: "status", header: "Status", render: (policy) => <StatusBadge status={policy.status} /> },
        ]}
        rows={policies}
        getRowKey={(policy) => policy._id.toString()}
        emptyMessage="No leave policies yet."
      />
    </div>
  );
}
