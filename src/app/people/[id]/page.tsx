import { notFound } from "next/navigation";
import { getCurrentOrganization } from "../../_shared/get-current-organization";
import { hasPermission } from "../../_shared/has-permission";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { NotFoundError } from "@/shared/errors";
import { TransferForm } from "./transfer-form";
import { TerminateButton } from "./terminate-button";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("employees.read", organizationId))) {
    return <p className="text-sm">You don&apos;t have access to view this employee.</p>;
  }

  let detail;
  try {
    detail = await EmployeeService.getDetail(id, organizationId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const canUpdate = await hasPermission("employees.update", organizationId);

  const [positions, projects, roster] = await Promise.all([
    PositionService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
  ]);
  const positionTitleById = new Map(positions.map((position) => [position._id.toString(), position.title]));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const employeeNameById = new Map(
    roster.filter((row) => row.person).map((row) => [row._id.toString(), `${row.person!.firstName} ${row.person!.lastName}`]),
  );

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">
        {detail.person ? `${detail.person.firstName} ${detail.person.lastName}` : "Employee"}
      </h1>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Employee #{detail.employee.employeeNumber}
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-medium" style={{ color: "var(--muted)" }}>Employment</h2>
        <p className="mt-2 text-sm">
          Status: {detail.currentEmployment?.status ?? "—"} · Type: {detail.currentEmployment?.employmentType ?? "—"}
        </p>
        {canUpdate && detail.currentEmployment?.status !== "terminated" && (
          <div className="mt-3">
            <TerminateButton employeeId={detail.employee._id.toString()} organizationId={organizationId} />
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium" style={{ color: "var(--muted)" }}>Current assignment</h2>
        <p className="mt-2 text-sm">
          Position: {detail.currentAssignment?.positionId ? positionTitleById.get(detail.currentAssignment.positionId.toString()) ?? "—" : "—"}
          {" · "}
          Project: {detail.currentAssignment?.projectId ? projectNameById.get(detail.currentAssignment.projectId.toString()) ?? "—" : "—"}
          {" · "}
          Reports to: {detail.currentAssignment?.reportsToEmployeeId ? employeeNameById.get(detail.currentAssignment.reportsToEmployeeId.toString()) ?? "—" : "—"}
        </p>
      </section>

      {canUpdate && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--muted)" }}>Transfer</h2>
          <TransferForm
            employeeId={detail.employee._id.toString()}
            organizationId={organizationId}
            positions={positions.map((position) => ({ id: position._id.toString(), label: position.title }))}
            projects={projects.map((project) => ({ id: project._id.toString(), label: project.name }))}
            managers={roster
              .filter((row) => row.person && row._id.toString() !== detail.employee._id.toString())
              .map((row) => ({ id: row._id.toString(), label: `${row.person!.firstName} ${row.person!.lastName}` }))}
          />
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-medium" style={{ color: "var(--muted)" }}>Assignment history</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--muted)" }}>
              <th className="pb-2">Position</th>
              <th className="pb-2">Project</th>
              <th className="pb-2">Reports to</th>
              <th className="pb-2">From</th>
              <th className="pb-2">To</th>
            </tr>
          </thead>
          <tbody>
            {detail.assignmentHistory.map((assignment) => (
              <tr key={assignment._id.toString()} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="py-2">{assignment.positionId ? positionTitleById.get(assignment.positionId.toString()) ?? "—" : "—"}</td>
                <td className="py-2">{assignment.projectId ? projectNameById.get(assignment.projectId.toString()) ?? "—" : "—"}</td>
                <td className="py-2">{assignment.reportsToEmployeeId ? employeeNameById.get(assignment.reportsToEmployeeId.toString()) ?? "—" : "—"}</td>
                <td className="py-2">{new Date(assignment.effectiveFrom).toLocaleDateString()}</td>
                <td className="py-2">{assignment.effectiveTo ? new Date(assignment.effectiveTo).toLocaleDateString() : "current"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
