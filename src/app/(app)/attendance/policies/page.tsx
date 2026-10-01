import type { Metadata } from "next";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { AttendancePolicyService } from "@/domains/attendance/attendance-policy-service";
import { ProjectService } from "@/domains/organization/project-service";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { policyCoverage } from "@/server/policies/policy-coverage";
import { Building2, Clock, FolderKanban } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreatePolicyDialog } from "./create-policy-dialog";

export const metadata: Metadata = { title: "Attendance policies" };

export default async function AttendancePoliciesPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("attendance-policies.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view attendance policies.</p>;
  }

  const [policies, projects] = await Promise.all([AttendancePolicyService.listCurrent(organizationId), ProjectService.listCurrent(organizationId)]);
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const coverage = policyCoverage(policies);

  const createAction = (
    <CreatePolicyDialog
      organizationId={organizationId}
      projects={projects.map((project) => ({
        id: project._id.toString(),
        label: project.name,
      }))}
    />
  );
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attendance policies"
        description="Working hours and the grace period that decide on-time vs. late. A project policy overrides the organization's for that site."
        action={createAction}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="Policies in force" value={coverage.inForce} hint={coverage.retired ? `${coverage.retired} retired, kept for history` : "None retired"} icon={Clock} emphasis />
        <MetricCard
          label="Organization-wide"
          value={coverage.orgWide}
          hint={coverage.orgWide ? "Applies where a project has none" : "None yet: every clock-in counts as on time"}
          icon={Building2}
          tone={coverage.orgWide ? "default" : "warning"}
        />
        <MetricCard label="Project overrides" value={coverage.projectOverrides} hint={`${coverage.projectsWithOwn} of ${projects.length} projects have their own hours`} icon={FolderKanban} />
      </div>
      <DataTable
        caption="Attendance policies"
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
            key: "hours",
            header: "Working hours",
            render: (policy) => (
              <div className="flex flex-col">
                <span className="tabular-nums">
                  {policy.standardStartTime}–{policy.standardEndTime}
                </span>
                <span className="text-xs text-muted-foreground">{(policy.workDays ?? []).map((day: number) => WEEKDAYS[day]).join(", ")}</span>
              </div>
            ),
          },
          {
            key: "grace",
            header: "Grace period",
            render: (policy) => (policy.gracePeriodMinutes ? `${policy.gracePeriodMinutes} min` : "None"),
          },
          {
            key: "status",
            header: "Status",
            render: (policy) => <StatusBadge status={policy.status} />,
          },
        ]}
        rows={policies}
        getRowKey={(policy) => policy._id.toString()}
        emptyMessage="No attendance policies yet."
        emptyDescription="Set the organization's working hours and grace period; without one, every clock-in counts as present."
        emptyAction={createAction}
      />
    </div>
  );
}
