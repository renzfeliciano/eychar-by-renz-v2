import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { EmploymentTypeService } from "@/domains/catalog/employment-type-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { PeopleFilters } from "./people-filters";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PeoplePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("employees.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view employees.</p>;
  }

  const [fullRoster, positions, projects, employmentTypes] = await Promise.all([
    EmployeeService.listWithCurrentStatus(organizationId),
    PositionService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
    EmploymentTypeService.listCurrent(organizationId),
  ]);
  const positionTitleById = new Map(positions.map((position) => [position._id.toString(), position.title]));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));

  const employmentTypeFilter = firstValue(params.employmentType);
  const roster = employmentTypeFilter
    ? fullRoster.filter((row) => row.currentEmployment?.employmentType === employmentTypeFilter)
    : fullRoster;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="People"
        description="The company's full employee roster and current status."
        action={
          <Link href="/people/new" className={buttonVariants()}>
            <UserPlus className="size-4" />
            Add employee
          </Link>
        }
      />

      <PeopleFilters employmentTypes={employmentTypes.map((item) => ({ id: item.code, label: item.name }))} />

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
        emptyMessage={employmentTypeFilter ? "No employees match this filter." : "No employees yet."}
      />
    </div>
  );
}
