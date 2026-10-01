import type { Metadata } from "next";
import { Briefcase, UserCheck, UserPlus, Users } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { RecruitmentStageService } from "@/domains/catalog/recruitment-stage-service";
import { ApplicantService } from "@/domains/recruitment/applicant-service";
import { PositionService } from "@/domains/organization/position-service";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { ApplicantPipeline } from "./applicant-pipeline";
import { ApplicantFormDialog } from "./applicant-form-dialog";

export const metadata: Metadata = { title: "Application tracking" };

export default async function ApplicationTrackingPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("applicants.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view applicants.</p>;
  }

  const [canCreate, canUpdate] = await Promise.all([
    hasPermission("applicants.create", organizationId),
    hasPermission("applicants.update", organizationId),
  ]);

  const [stages, applicants, positions] = await Promise.all([
    RecruitmentStageService.listCurrent(organizationId),
    ApplicantService.listForOrganization(organizationId),
    PositionService.listCurrent(organizationId),
  ]);

  const positionTitleById = new Map(positions.map((position) => [position._id.toString(), position.title]));
  const positionOptions = positions.map((position) => ({ id: position._id.toString(), label: position.title }));

  const stageRows = stages.map((stage) => ({ code: stage.code, name: stage.name, isTerminal: Boolean(stage.metadata?.isTerminal) }));

  const applicantRows = applicants.map((applicant) => ({
    _id: applicant._id.toString(),
    positionId: applicant.positionId.toString(),
    applicantName: applicant.applicantName,
    email: applicant.email,
    phone: applicant.phone,
    stage: applicant.stage,
    appliedDate: applicant.appliedDate.toISOString(),
    remarks: applicant.remarks,
    positionTitle: positionTitleById.get(applicant.positionId.toString()) ?? "—",
  }));

  // Any stage still referenced by an existing applicant but no longer in
  // the active catalog (renamed/deactivated) still gets its own column, so
  // that applicant is never silently hidden — matching v1's same guard.
  const knownCodes = new Set(stageRows.map((stage) => stage.code));
  const orphanedStages = [...new Set(applicantRows.map((applicant) => applicant.stage).filter((code) => !knownCodes.has(code)))].map(
    (code) => ({ code, name: applicantRows.find((applicant) => applicant.stage === code)?.stage ?? code }),
  );
  const allStages = [...stageRows, ...orphanedStages];

  // Pipeline summary: terminal stages (hired, rejected) are out of the pipeline.
  const terminalCodes = new Set(stages.filter((stage) => stage.metadata?.isTerminal).map((stage) => stage.code));
  const inPipeline = applicantRows.filter((applicant) => !terminalCodes.has(applicant.stage));
  const recent = applicantRows.filter((applicant) => new Date().getTime() - new Date(applicant.appliedDate).getTime() <= 30 * 86_400_000).length;
  const hired = applicantRows.filter((applicant) => applicant.stage === "hired").length;
  const hiringFor = new Set(inPipeline.map((applicant) => applicant.positionId)).size;
  const closed = applicantRows.filter((applicant) => terminalCodes.has(applicant.stage)).length;
  const stalled = inPipeline.filter((applicant) => new Date().getTime() - new Date(applicant.appliedDate).getTime() > 30 * 86_400_000).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Application tracking"
        description="Every applicant from application to hire. Drag a card between stages, or open it for details."
        action={canCreate ? <ApplicantFormDialog organizationId={organizationId} positions={positionOptions} /> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="In the pipeline" value={inPipeline.length} hint={stalled ? `${stalled} waiting over 30 days` : "Not yet hired or rejected"} icon={Users} emphasis />
        <MetricCard label="New applicants" value={recent} hint="Applied in the last 30 days" icon={UserPlus} />
        <MetricCard label="Positions hiring" value={hiringFor} hint="With applicants in progress" icon={Briefcase} />
        <MetricCard
          label="Hired"
          value={hired}
          hint={closed ? `${Math.round((hired / closed) * 100)}% of closed applications` : "No closed applications yet"}
          icon={UserCheck}
          tone={hired ? "success" : "default"}
        />
      </div>

      {allStages.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">No recruitment stages yet</p>
          <p className="text-sm text-muted-foreground">Add your hiring stages (e.g. Applied, Interview, Offer, Hired) under Settings › Catalogs.</p>
        </div>
      ) : (
        <ApplicantPipeline
          organizationId={organizationId}
          stages={allStages}
          applicants={applicantRows}
          positions={positionOptions}
          canUpdate={canUpdate}
          nowIso={new Date().toISOString()}
        />
      )}
    </div>
  );
}
