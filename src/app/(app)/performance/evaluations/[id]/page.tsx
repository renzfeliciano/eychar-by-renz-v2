import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { requireAuthenticatedUser } from "@/server/authorization";
import { resolveEvaluationActor } from "@/domains/performance/evaluation-actor";
import { PerformanceEvaluationService } from "@/domains/performance/performance-evaluation-service";
import { EvaluationTypeService } from "@/domains/catalog/evaluation-type-service";
import { getTemplate } from "@/domains/performance/evaluation-template";
import { AuthorizationError } from "@/shared/errors";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { NoAccessState } from "@/components/shared/no-access-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EvaluationForm } from "./evaluation-form";
import { EvaluationSheet } from "./evaluation-sheet";
import { AcknowledgePanel } from "./acknowledge-panel";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Performance evaluation" };

const dateInput = (date: Date) => new Date(date).toISOString().slice(0, 10);

export default async function EvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("performance-evaluations.read", organizationId))) {
    return <NoAccessState permission="performance-evaluations.read" message="You don't have access to performance evaluations." />;
  }

  const { userId } = await requireAuthenticatedUser();
  const actor = await resolveEvaluationActor(userId, organizationId);
  let detail;
  try {
    detail = await PerformanceEvaluationService.getDetail(id, organizationId, actor);
  } catch (error) {
    // Someone else's evaluation reads the same as one that doesn't exist for them.
    if (error instanceof AuthorizationError) return <NoAccessState permission="performance-evaluations.manage" message="This evaluation is assigned to another evaluator." />;
    throw error;
  }

  const { evaluation, header } = detail;
  const [types, canAcknowledge] = await Promise.all([EvaluationTypeService.listCurrent(organizationId), hasPermission("performance-evaluations.acknowledge", organizationId)]);
  const ratings = Object.fromEntries(evaluation.ratings.map((entry: { criterionKey: string; rating: string }) => [entry.criterionKey, entry.rating]));
  const isDraft = evaluation.status === "draft";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Evaluation: ${header.employeeName}`}
        description={`${header.evaluationForName} · Employee Performance Evaluation Form`}
        action={
          <div className="flex items-center gap-2 print:hidden">
            <StatusBadge status={evaluation.status} />
            {!isDraft && <PrintButton />}
            <Link href="/performance" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <ArrowLeft className="size-3.5" />
              All evaluations
            </Link>
          </div>
        }
      />

      {isDraft ? (
        <EvaluationForm
          organizationId={organizationId}
          evaluationId={id}
          factors={getTemplate(evaluation.templateVersion).factors}
          types={types.filter((type) => type.status === "active" || type.code === evaluation.evaluationFor).map((type) => ({ id: type.code, label: type.name }))}
          initial={{
            evaluationFor: evaluation.evaluationFor,
            periodStart: dateInput(evaluation.periodStart),
            periodEnd: dateInput(evaluation.periodEnd),
            ratings,
            goals: evaluation.goals ?? "",
            comments: evaluation.evaluatorComments ?? "",
          }}
          header={header}
        />
      ) : (
        <>
          <EvaluationSheet
            data={{
              header,
              periodStart: evaluation.periodStart,
              periodEnd: evaluation.periodEnd,
              templateVersion: evaluation.templateVersion,
              ratings,
              goals: evaluation.goals,
              comments: evaluation.evaluatorComments,
              evaluatorAck: evaluation.evaluatorAcknowledgment ? { typedName: evaluation.evaluatorAcknowledgment.typedName, at: evaluation.evaluatorAcknowledgment.at } : undefined,
              employeeAck: evaluation.employeeAcknowledgment
                ? { typedName: evaluation.employeeAcknowledgment.typedName, at: evaluation.employeeAcknowledgment.at, comments: evaluation.employeeAcknowledgment.comments }
                : undefined,
            }}
          />
          {evaluation.status === "submitted" && canAcknowledge && <AcknowledgePanel organizationId={organizationId} evaluationId={id} employeeName={header.employeeName} />}
        </>
      )}
    </div>
  );
}
