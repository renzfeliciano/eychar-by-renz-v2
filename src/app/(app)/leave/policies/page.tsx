import type { Metadata } from "next";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { LeavePolicyService } from "@/domains/leave/leave-policy-service";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { ProjectService } from "@/domains/organization/project-service";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { policyCoverage } from "@/server/policies/policy-coverage";
import { Building2, FolderKanban, ListChecks } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreateLeavePolicyDialog } from "./create-leave-policy-dialog";

export const metadata: Metadata = { title: "Leave policies" };

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
  const coverage = policyCoverage(policies);
  const coveredTypes = new Set(policies.filter((policy) => policy.status !== "inactive").map((policy) => policy.leaveTypeId.toString())).size;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leave policies"
        description="Annual entitlement per leave type, with optional project overrides."
        action={
          <CreateLeavePolicyDialog
            organizationId={organizationId}
            leaveTypes={leaveTypes.map((leaveType) => ({
              id: leaveType._id.toString(),
              label: leaveType.name,
            }))}
            projects={projects.map((project) => ({
              id: project._id.toString(),
              label: project.name,
            }))}
          />
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          label="Leave types covered"
          value={`${coveredTypes} of ${leaveTypes.length}`}
          hint={coveredTypes < leaveTypes.length ? "Types without a policy grant no days automatically" : "Every leave type has an entitlement"}
          icon={ListChecks}
          tone={coveredTypes < leaveTypes.length ? "warning" : "success"}
        />
        <MetricCard label="Organization-wide" value={coverage.orgWide} hint="Entitlements for everyone" icon={Building2} emphasis />
        <MetricCard label="Project overrides" value={coverage.projectOverrides} hint={`${coverage.projectsWithOwn} of ${projects.length} projects have their own`} icon={FolderKanban} />
      </div>
      <DataTable
        caption="Leave policies"
        columns={[
          {
            key: "name",
            header: "Policy",
            render: (policy) => (
              <div className="flex flex-col">
                <span className="font-medium">{policy.name}</span>
                <span className="text-xs text-muted-foreground">{policy.projectId ? (projectNameById.get(policy.projectId.toString()) ?? "Project") : "Whole organization"}</span>
              </div>
            ),
          },
          {
            key: "leaveType",
            header: "Leave type",
            render: (policy) => leaveTypeNameById.get(policy.leaveTypeId.toString()) ?? "—",
          },
          {
            key: "entitlement",
            header: "Days a year",
            className: "text-right",
            render: (policy) => <span className="font-medium tabular-nums">{policy.annualEntitlementDays}</span>,
          },
          {
            key: "status",
            header: "Status",
            render: (policy) => <StatusBadge status={policy.status} />,
          },
        ]}
        rows={policies}
        getRowKey={(policy) => policy._id.toString()}
        emptyMessage="No leave policies yet."
        emptyDescription="Set how many days a year each leave type gives; a project can override the organization's."
      />
    </div>
  );
}
