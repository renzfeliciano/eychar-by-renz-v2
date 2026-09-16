import { notFound } from "next/navigation";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { JobOpeningService } from "@/domains/recruitment/job-opening-service";
import { ApplicantService } from "@/domains/recruitment/applicant-service";
import { PositionService } from "@/domains/organization/position-service";
import { NotFoundError } from "@/shared/errors";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { AddApplicantDialog } from "./add-applicant-dialog";
import { CloseOpeningButton } from "../close-opening-button";

export default async function JobOpeningDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("job-openings.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view this job opening.</p>;
  }

  let opening;
  try {
    opening = await JobOpeningService.getById(id, organizationId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const [canCreateApplicant, canUpdateOpening, applicants, position] = await Promise.all([
    hasPermission("applicants.create", organizationId),
    hasPermission("job-openings.update", organizationId),
    ApplicantService.listForJobOpening(id, organizationId),
    PositionService.listCurrent(organizationId).then((positions) =>
      positions.find((candidate) => candidate._id.toString() === opening.positionId.toString()),
    ),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={position?.title ?? "Job opening"}
        description={`${opening.headcount} headcount · ${applicants.length} applicant(s)`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={opening.status} />
            {canUpdateOpening && opening.status === "open" && (
              <CloseOpeningButton jobOpeningId={opening._id.toString()} organizationId={organizationId} />
            )}
            {canCreateApplicant && opening.status === "open" && (
              <AddApplicantDialog organizationId={organizationId} jobOpeningId={opening._id.toString()} />
            )}
          </div>
        }
      />

      <DataTable
        caption="Applicants"
        columns={[
          {
            key: "name",
            header: "Name",
            render: (applicant) => <span className="font-medium">{applicant.firstName} {applicant.lastName}</span>,
          },
          { key: "email", header: "Email", render: (applicant) => applicant.email ?? "—" },
          { key: "stage", header: "Stage", render: (applicant) => <StatusBadge status={applicant.stage} /> },
          { key: "applied", header: "Applied", render: (applicant) => new Date(applicant.appliedAt).toLocaleDateString() },
        ]}
        rows={applicants}
        getRowKey={(applicant) => applicant._id.toString()}
        emptyMessage="No applicants yet."
      />
    </div>
  );
}
