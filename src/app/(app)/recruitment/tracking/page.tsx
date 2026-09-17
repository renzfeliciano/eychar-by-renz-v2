import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { RecruitmentStageService } from "@/domains/catalog/recruitment-stage-service";
import { ApplicantService } from "@/domains/recruitment/applicant-service";
import { PositionService } from "@/domains/organization/position-service";
import { PageHeader } from "@/components/shared/page-header";
import { KanbanBoard } from "./kanban-board";
import { ApplicantFormDialog } from "./applicant-form-dialog";

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

  const stageRows = stages.map((stage) => ({ code: stage.code, name: stage.name }));

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Application tracking"
        description="Move an applicant's card between stages, or use its Move menu."
        action={canCreate ? <ApplicantFormDialog organizationId={organizationId} positions={positionOptions} /> : undefined}
      />

      {allStages.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No recruitment stages configured yet — add some under Settings &gt; Catalogs.
        </p>
      ) : (
        <KanbanBoard
          organizationId={organizationId}
          stages={allStages}
          applicants={applicantRows}
          positions={positionOptions}
          canUpdate={canUpdate}
        />
      )}
    </div>
  );
}
