import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { EmploymentTypeService } from "@/domains/catalog/employment-type-service";
import { PageHeader } from "@/components/shared/page-header";
import { HireForm } from "./hire-form";

export default async function NewEmployeePage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("employees.create", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to hire employees.</p>;
  }

  const [positions, projects, roster, employmentTypes] = await Promise.all([
    PositionService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
    EmploymentTypeService.listCurrent(organizationId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Hire employee" description="Creates the person, employee record, employment, and initial assignment." />
      <HireForm
        organizationId={organizationId}
        positions={positions.map((position) => ({ id: position._id.toString(), label: position.title }))}
        projects={projects.map((project) => ({ id: project._id.toString(), label: project.name }))}
        managers={roster
          .filter((row) => row.person)
          .map((row) => ({ id: row._id.toString(), label: `${row.person!.firstName} ${row.person!.lastName}` }))}
        employmentTypes={employmentTypes.map((item) => ({ id: item.code, label: item.name }))}
      />
    </div>
  );
}
