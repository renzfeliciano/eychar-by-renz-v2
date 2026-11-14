import type { Metadata } from "next";

import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { ComplaintStageService } from "@/domains/catalog/complaint-stage-service";
import { ComplaintService } from "@/domains/complaints/complaint-service";
import { isClosedStage, withOrphanedStages } from "@/domains/complaints/pipeline";
import { serializeStageDetails } from "@/domains/complaints/stage-sections";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { ProjectService } from "@/domains/organization/project-service";
import { formatPersonName } from "@/lib/person-name";
import { PageHeader } from "@/components/shared/page-header";
import { NoAccessState } from "@/components/shared/no-access-state";
import { ComplaintPipeline } from "./complaint-pipeline";
import { ComplaintFormDialog } from "./complaint-form-dialog";

export const metadata: Metadata = { title: "Complaints" };

export default async function ComplaintsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("complaints.read", organizationId))) {
    return <NoAccessState permission="complaints.read" message="You don't have access to view complaints." />;
  }

  const [canCreate, canUpdate] = await Promise.all([hasPermission("complaints.create", organizationId), hasPermission("complaints.update", organizationId)]);

  const [stages, complaints, roster, projects] = await Promise.all([
    ComplaintStageService.listCurrent(organizationId),
    ComplaintService.listForOrganization(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
    ProjectService.listCurrent(organizationId),
  ]);

  // Only active projects can be picked; a complaint keeps showing the name of one that was deactivated since.
  const projectOptions = projects.filter((project) => project.status === "active").map((project) => ({ id: project._id.toString(), label: project.name }));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));

  const employeeOptions = roster.filter((row) => row.person).map((row) => ({ id: row._id.toString(), label: formatPersonName(row.person) }));
  const nameById = new Map(employeeOptions.map((option) => [option.id, option.label]));

  const stageRows = stages
    .filter((stage) => stage.status === "active")
    .map((stage) => ({ code: stage.code, name: stage.name, isTerminal: isClosedStage(stage), ...(stage.description ? { description: stage.description } : {}) }));

  const complaintRows = complaints.map((complaint) => ({
    _id: complaint._id.toString(),
    irNumber: complaint.irNumber,
    employeeId: complaint.employeeId.toString(),
    respondentName: nameById.get(complaint.employeeId.toString()) ?? "—",
    stage: complaint.stage,
    receivedDate: complaint.receivedDate.toISOString(),
    remarks: complaint.remarks,
    projectId: complaint.projectId?.toString(),
    projectName: complaint.projectId ? projectNameById.get(complaint.projectId.toString()) : undefined,
    description: complaint.description,
    what: complaint.what,
    where: complaint.where,
    incidentDate: complaint.incidentDate?.toISOString(),
    complainantName: complaint.complainantName,
    stageDetails: serializeStageDetails(complaint.stageDetails),
  }));

  // A complaint in a stage HR later deactivated or removed still gets its own column, so it is never hidden.
  const retiredNames = new Map(stages.filter((stage) => stage.status !== "active").map((stage) => [stage.code, stage.name]));
  const allStages = withOrphanedStages(stageRows, complaintRows).map((stage) => (retiredNames.has(stage.code) ? { ...stage, name: retiredNames.get(stage.code)! } : stage));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Complaints"
        description="Every incident report and complaint from receipt to sanction. Drag a card between stages to record that stage's details, or open it for the full record."
        action={canCreate ? <ComplaintFormDialog organizationId={organizationId} employees={employeeOptions} projects={projectOptions} /> : undefined}
      />

      {allStages.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">No complaint stages yet</p>
          <p className="text-sm text-muted-foreground">Add your stages (e.g. Received IR/complaint, Set a date for NTE, Administrative Hearing, Sanction) under Settings › Catalogs.</p>
        </div>
      ) : (
        <ComplaintPipeline organizationId={organizationId} stages={allStages} complaints={complaintRows} employees={employeeOptions} projects={projectOptions} canUpdate={canUpdate} />
      )}
    </div>
  );
}
