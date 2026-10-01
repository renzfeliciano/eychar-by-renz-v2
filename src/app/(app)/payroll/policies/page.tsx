import type { Metadata } from "next";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PayrollPolicyService } from "@/domains/payroll/payroll-policy-service";
import { ProjectService } from "@/domains/organization/project-service";
import { PAY_FREQUENCY_LABELS, type PayFrequency } from "@/domains/payroll/engine/pay-frequency";
import { WEEKDAY_NAMES } from "@/domains/payroll/payroll-labels";
import { dateToDateKey, formatDateKey } from "@/lib/date-key";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { policyCoverage } from "@/server/policies/policy-coverage";
import { Building2, CalendarClock, FolderKanban } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreatePayrollPolicyDialog } from "./create-payroll-policy-dialog";

export const metadata: Metadata = { title: "Payroll policies" };

function describeWorkWeek(days: number[]): string {
  const sorted = [...days].sort();
  const isRange = sorted.every((day, index) => index === 0 || day === sorted[index - 1] + 1);
  if (isRange && sorted.length > 2) return `${WEEKDAY_NAMES[sorted[0]].slice(0, 3)}–${WEEKDAY_NAMES[sorted.at(-1)!].slice(0, 3)}`;
  return sorted.map((day) => WEEKDAY_NAMES[day].slice(0, 3)).join(", ");
}

export default async function PayrollPoliciesPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("payroll-policies.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view payroll policies.</p>;
  }

  const [canCreate, policies, projects] = await Promise.all([
    hasPermission("payroll-policies.create", organizationId),
    PayrollPolicyService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
  ]);
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const coverage = policyCoverage(policies);
  const frequencies = [...new Set(policies.filter((policy) => policy.status !== "inactive").map((policy) => PAY_FREQUENCY_LABELS[policy.payFrequency as PayFrequency] ?? policy.payFrequency))];
  const projectOptions = projects.filter((project) => project.status === "active").map((project) => ({ id: project._id.toString(), label: project.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payroll policies"
        description="How pay is computed: frequency, workdays, lates, and when contributions come off. A project policy overrides the organization's."
        action={canCreate ? <CreatePayrollPolicyDialog organizationId={organizationId} projects={projectOptions} /> : undefined}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          label="Organization-wide"
          value={coverage.orgWide}
          hint={coverage.orgWide ? "Used where a project has none" : "None yet: payroll runs can't be prepared"}
          icon={Building2}
          emphasis={coverage.orgWide > 0}
          tone={coverage.orgWide ? "default" : "danger"}
        />
        <MetricCard label="Project overrides" value={coverage.projectOverrides} hint={`${coverage.projectsWithOwn} of ${projects.length} projects paid differently`} icon={FolderKanban} />
        <MetricCard label="Pay frequencies" value={frequencies.length || "—"} hint={frequencies.join(", ") || "Set by the first policy"} icon={CalendarClock} />
      </div>
      <DataTable
        caption="Payroll policies"
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
            key: "frequency",
            header: "Pay frequency",
            render: (policy) => PAY_FREQUENCY_LABELS[policy.payFrequency as PayFrequency] ?? policy.payFrequency,
          },
          {
            key: "days",
            header: "Work week",
            render: (policy) => (
              <div className="flex flex-col">
                <span>{describeWorkWeek(policy.workWeekDays ?? [])}</span>
                <span className="text-xs text-muted-foreground">
                  {policy.workDaysPerYear} paid days a year · {policy.hoursPerDay}h a day
                </span>
              </div>
            ),
          },
          {
            key: "rules",
            header: "Deductions",
            render: (policy) => (
              <div className="flex flex-col text-xs">
                <span>{policy.deductLateAndUndertime ? "Lates and undertime deducted" : "Lates not deducted"}</span>
                <span className="text-muted-foreground">
                  {policy.contributionTiming === "last_cutoff_of_month" ? "Contributions on the month's last cutoff" : "Contributions split across cutoffs"}
                </span>
              </div>
            ),
          },
          {
            key: "effective",
            header: "Effective",
            render: (policy) => `From ${formatDateKey(dateToDateKey(policy.effectiveFrom))}`,
          },
          {
            key: "status",
            header: "Status",
            render: (policy) => <StatusBadge status={policy.status} />,
          },
        ]}
        rows={policies}
        getRowKey={(policy) => policy._id.toString()}
        emptyMessage="No payroll policies yet. Add the organization's first to start running payroll."
      />
    </div>
  );
}
