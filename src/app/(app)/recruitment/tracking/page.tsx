import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { RecruitmentStageService } from "@/domains/catalog/recruitment-stage-service";
import { ApplicantService } from "@/domains/recruitment/applicant-service";
import { JobOpeningService } from "@/domains/recruitment/job-opening-service";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { LocationService } from "@/domains/organization/location-service";
import { OrganizationUnitService } from "@/domains/organization/organization-unit-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { EmploymentTypeService } from "@/domains/catalog/employment-type-service";
import { PageHeader } from "@/components/shared/page-header";
import { StageColumn } from "./stage-column";

export default async function ApplicationTrackingPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("applicants.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view applicants.</p>;
  }

  const [canUpdate, canHire] = await Promise.all([
    hasPermission("applicants.update", organizationId),
    hasPermission("applicants.hire", organizationId),
  ]);

  const [stages, applicants, openings, positions, projects, locations, units, roster, employmentTypes] = await Promise.all([
    RecruitmentStageService.listCurrent(organizationId),
    ApplicantService.listForOrganization(organizationId),
    JobOpeningService.listCurrent(organizationId),
    PositionService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
    LocationService.listCurrent(organizationId),
    OrganizationUnitService.listCurrent(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
    EmploymentTypeService.listCurrent(organizationId),
  ]);

  const positionTitleById = new Map(positions.map((position) => [position._id.toString(), position.title]));
  const openingById = new Map(openings.map((opening) => [opening._id.toString(), opening]));

  const stageRows = stages.map((stage) => ({
    _id: stage._id.toString(),
    code: stage.code,
    name: stage.name,
    sortOrder: stage.sortOrder,
    isTerminal: Boolean((stage.metadata as Record<string, unknown> | undefined)?.isTerminal),
  }));

  const applicantRows = applicants.map((applicant) => {
    const opening = openingById.get(applicant.jobOpeningId.toString());
    return {
      _id: applicant._id.toString(),
      firstName: applicant.firstName,
      lastName: applicant.lastName,
      email: applicant.email,
      stage: applicant.stage,
      rejectionReason: applicant.rejectionReason,
      hiredEmployeeId: applicant.hiredEmployeeId?.toString(),
      positionTitle: opening ? positionTitleById.get(opening.positionId.toString()) ?? "—" : "—",
    };
  });

  const assignmentOptions = {
    positions: positions.map((position) => ({ id: position._id.toString(), label: position.title })),
    projects: projects.map((project) => ({ id: project._id.toString(), label: project.name })),
    locations: locations.map((location) => ({ id: location._id.toString(), label: location.name })),
    organizationUnits: units.map((unit) => ({ id: unit._id.toString(), label: unit.name })),
    managers: roster.filter((row) => row.person).map((row) => ({ id: row._id.toString(), label: `${row.person!.firstName} ${row.person!.lastName}` })),
    employmentTypes: employmentTypes.map((item) => ({ id: item.code, label: item.name })),
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Application tracking" description="The applicant pipeline, by stage." />

      {stageRows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No recruitment stages configured yet — add some under Settings &gt; Catalogs.
        </p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {stageRows.map((stage) => (
            <StageColumn
              key={stage._id}
              organizationId={organizationId}
              stage={stage}
              stages={stageRows}
              applicants={applicantRows.filter((applicant) => applicant.stage === stage.code)}
              canUpdate={canUpdate}
              canHire={canHire}
              assignmentOptions={assignmentOptions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
