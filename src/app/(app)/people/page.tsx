import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";

export default async function PeoplePage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("employees.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view employees.</p>;
  }

  const [roster, positions, projects] = await Promise.all([
    EmployeeService.listWithCurrentStatus(organizationId),
    PositionService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
  ]);
  const positionTitleById = new Map(positions.map((position) => [position._id.toString(), position.title]));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="People"
        description="Every employee's current employment status and assignment."
        action={
          <Link href="/people/new" className={buttonVariants()}>
            <UserPlus className="size-4" />
            Hire employee
          </Link>
        }
      />

      <DataTable
        columns={[
          {
            key: "name",
            header: "Name",
            render: (row) => (
              <Link href={`/people/${row._id.toString()}`} className="font-medium text-primary hover:underline">
                {row.person ? `${row.person.firstName} ${row.person.lastName}` : "—"}
              </Link>
            ),
          },
          { key: "employeeNumber", header: "Employee #", render: (row) => row.employeeNumber },
          { key: "status", header: "Employment status", render: (row) => <StatusBadge status={row.currentEmployment?.status} /> },
          {
            key: "position",
            header: "Position",
            render: (row) =>
              row.currentAssignment?.positionId ? positionTitleById.get(row.currentAssignment.positionId.toString()) ?? "—" : "—",
          },
          {
            key: "project",
            header: "Project",
            render: (row) =>
              row.currentAssignment?.projectId ? projectNameById.get(row.currentAssignment.projectId.toString()) ?? "—" : "—",
          },
        ]}
        rows={roster}
        getRowKey={(row) => row._id.toString()}
        emptyMessage="No employees yet."
      />
    </div>
  );
}
