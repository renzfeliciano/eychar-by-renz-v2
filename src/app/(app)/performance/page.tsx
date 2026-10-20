import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";

import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { requireAuthenticatedUser } from "@/server/authorization";
import { resolveEvaluationActor } from "@/domains/performance/evaluation-actor";
import { PerformanceEvaluationService } from "@/domains/performance/performance-evaluation-service";
import { EvaluationTypeService } from "@/domains/catalog/evaluation-type-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { formatPersonName } from "@/lib/person-name";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard, MetricStrip } from "@/components/shared/metric-card";
import { NoAccessState } from "@/components/shared/no-access-state";
import { buttonVariants } from "@/components/ui/button";
import { formatCalendarDate } from "@/lib/date-key";
import { cn } from "@/lib/utils";
import { NewEvaluationDialog } from "./new-evaluation-dialog";

export const metadata: Metadata = { title: "Performance" };

// Evaluation periods are calendar days (UTC midnight).
const SHORT = { month: "short", day: "numeric", year: "numeric" } as const;

export default async function PerformancePage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;

  const organizationId = organization._id.toString();
  const [canRead, canCreate, canSeeCycles] = await Promise.all([
    hasPermission("performance-evaluations.read", organizationId),
    hasPermission("performance-evaluations.create", organizationId),
    hasPermission("review-cycles.read", organizationId),
  ]);
  if (!canRead) {
    return <NoAccessState permission="performance-evaluations.read" message="You don't have access to performance evaluations." />;
  }

  const { userId } = await requireAuthenticatedUser();
  const actor = await resolveEvaluationActor(userId, organizationId);
  const [evaluations, types, roster] = await Promise.all([
    PerformanceEvaluationService.list(organizationId, actor),
    EvaluationTypeService.listCurrent(organizationId),
    canCreate ? EmployeeService.listWithCurrentStatus(organizationId) : Promise.resolve([]),
  ]);

  const count = (status: string) => evaluations.filter((evaluation) => evaluation.status === status).length;
  const employeeOptions = roster.filter((row) => row.person).map((row) => ({ id: row._id.toString(), label: formatPersonName(row.person) }));
  const typeOptions = types
    .filter((type) => type.status === "active")
    .map((type) => ({ id: type.code, label: type.name, defaultPeriodMonths: typeof type.metadata?.defaultPeriodMonths === "number" ? type.metadata.defaultPeriodMonths : undefined }));

  const createAction = canCreate ? (
    <NewEvaluationDialog organizationId={organizationId} employees={employeeOptions} types={typeOptions} selfEmployeeId={actor.employeeId} canManage={actor.canManage} />
  ) : undefined;
  const legacyLink = canSeeCycles ? (
    <Link href="/performance/cycles" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
      <History className="size-3.5" />
      Earlier reviews
    </Link>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Performance"
        description={actor.canManage ? "Every employee performance evaluation." : "The evaluations you are the evaluator of."}
        action={
          <>
            {legacyLink}
            {createAction}
          </>
        }
      />

      <MetricStrip columns={3}>
        <MetricCard label="Drafts" value={count("draft")} hint="Not submitted yet" />
        <MetricCard label="Awaiting acknowledgment" value={count("submitted")} hint="Submitted, employee not yet acknowledged" emphasis />
        <MetricCard label="Acknowledged" value={count("acknowledged")} hint="Completed" />
      </MetricStrip>

      <DataTable
        caption="Performance evaluations"
        columns={[
          {
            key: "employee",
            header: "Employee",
            render: (evaluation) => (
              <Link href={`/performance/evaluations/${evaluation._id.toString()}`} className="font-medium text-primary hover:underline">
                {evaluation.employeeName}
              </Link>
            ),
          },
          { key: "for", header: "Evaluation for", render: (evaluation) => evaluation.evaluationForName },
          {
            key: "period",
            header: "Period",
            render: (evaluation) => `${formatCalendarDate(evaluation.periodStart, SHORT)} – ${formatCalendarDate(evaluation.periodEnd, SHORT)}`,
          },
          { key: "evaluator", header: "Evaluator", render: (evaluation) => evaluation.evaluatorName },
          { key: "status", header: "Status", render: (evaluation) => <StatusBadge status={evaluation.status} /> },
        ]}
        rows={evaluations}
        getRowKey={(evaluation) => evaluation._id.toString()}
        emptyMessage="No evaluations yet."
        emptyDescription="Start an evaluation for an employee, fill in the form, and submit it for their acknowledgment."
        emptyAction={createAction}
      />
    </div>
  );
}
