import { getCurrentOrganization } from "../../_shared/get-current-organization";
import { hasPermission } from "../../_shared/has-permission";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { HireForm } from "./hire-form";

export default async function NewEmployeePage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("employees.create", organizationId))) {
    return <p className="text-sm">You don&apos;t have access to hire employees.</p>;
  }

  const [positions, projects, roster] = await Promise.all([
    PositionService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
  ]);

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Hire employee</h1>
      <div className="mt-6">
        <HireForm
          organizationId={organizationId}
          positions={positions.map((position) => ({ id: position._id.toString(), label: position.title }))}
          projects={projects.map((project) => ({ id: project._id.toString(), label: project.name }))}
          managers={roster
            .filter((row) => row.person)
            .map((row) => ({ id: row._id.toString(), label: `${row.person!.firstName} ${row.person!.lastName}` }))}
        />
      </div>
    </main>
  );
}
