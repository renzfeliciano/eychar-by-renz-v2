import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { AttendancePolicyService } from "@/domains/attendance/attendance-policy-service";
import { ProjectService } from "@/domains/organization/project-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreatePolicyForm } from "./create-policy-form";

export default async function AttendancePoliciesPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("attendance-policies.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view attendance policies.</p>;
  }

  const [policies, projects] = await Promise.all([
    AttendancePolicyService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
  ]);
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Attendance policies" description="Standard hours, grace period, and org/project scope." />
      <CreatePolicyForm
        organizationId={organizationId}
        projects={projects.map((project) => ({ id: project._id.toString(), label: project.name }))}
      />
      <DataTable
        columns={[
          { key: "name", header: "Name", render: (policy) => <span className="font-medium">{policy.name}</span> },
          {
            key: "scope",
            header: "Scope",
            render: (policy) => (policy.projectId ? projectNameById.get(policy.projectId.toString()) ?? "—" : "Organization-wide"),
          },
          { key: "hours", header: "Hours", render: (policy) => `${policy.standardStartTime}–${policy.standardEndTime}` },
          { key: "grace", header: "Grace (min)", render: (policy) => policy.gracePeriodMinutes },
          { key: "status", header: "Status", render: (policy) => <StatusBadge status={policy.status} /> },
        ]}
        rows={policies}
        getRowKey={(policy) => policy._id.toString()}
        emptyMessage="No attendance policies yet."
      />
    </div>
  );
}
