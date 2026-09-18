import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";
import { EmploymentTypeService } from "@/domains/catalog/employment-type-service";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { calculateAge, formatLengthOfService } from "@/lib/employee-dates";
import { formatPersonName } from "@/lib/person-name";
import { PeopleFilters } from "./people-filters";
import { PeopleExportActions, type PeopleExportRow } from "./people-export-actions";
import { PeoplePrintReport } from "./people-print-report";

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

  const [fullRoster, positions, projects, employmentTypes, employmentStatuses] = await Promise.all([
    EmployeeService.listWithCurrentStatus(organizationId),
    PositionService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
    EmploymentTypeService.listCurrent(organizationId),
    EmploymentStatusService.listCurrent(organizationId),
  ]);
  const positionTitleById = new Map(positions.map((position) => [position._id.toString(), position.title]));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const statusNameByCode = new Map(employmentStatuses.map((item) => [item.code, item.name]));

  const employmentTypeFilter = firstValue(params.employmentType);
  const roster = employmentTypeFilter
    ? fullRoster.filter((row) => row.currentEmployment?.employmentType === employmentTypeFilter)
    : fullRoster;

  const exportRows: PeopleExportRow[] = roster.map((row) => {
    const dateHired = row.currentEmployment?.effectiveFrom;
    const birthDate = row.person?.birthDate;
    return {
      employeeNumber: row.employeeNumber ?? "—",
      name: row.person ? formatPersonName(row.person) : "—",
      gender: row.person?.gender ?? "",
      position: row.currentAssignment?.positionId ? positionTitleById.get(row.currentAssignment.positionId.toString()) ?? "—" : "—",
      project: row.currentAssignment?.projectId ? projectNameById.get(row.currentAssignment.projectId.toString()) ?? "—" : "—",
      employmentStatus: row.currentEmployment ? statusNameByCode.get(row.currentEmployment.status) ?? row.currentEmployment.status : "—",
      age: birthDate ? String(calculateAge(new Date(birthDate))) : "",
      lengthOfService: dateHired ? formatLengthOfService(new Date(dateHired)) : "—",
      dateHired: dateHired ? new Date(dateHired).toLocaleDateString() : "",
      birthDate: birthDate ? new Date(birthDate).toLocaleDateString() : "",
      contactNumber: row.person?.phone ?? "",
      address: row.person?.address ?? "",
      sssNumber: row.person?.sssNumber ?? "",
      philHealthNumber: row.person?.philHealthNumber ?? "",
      pagIbigNumber: row.person?.pagIbigNumber ?? "",
      tinNumber: row.person?.tinNumber ?? "",
    };
  });

  return (
    <>
      <div className="flex flex-col gap-6 print:hidden">
        <PageHeader
          title="Employee roster"
          description="Search and manage every employee — statutory IDs are included in exports and prints."
          action={
            <div className="flex items-center gap-2">
              <PeopleExportActions rows={exportRows} />
              <Link href="/people/new" className={buttonVariants()}>
                <UserPlus className="size-4" />
                Add employee
              </Link>
            </div>
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
                  {row.person ? formatPersonName(row.person) : "—"}
                </Link>
              ),
            },
            { key: "employeeNumber", header: "Employee #", render: (row) => row.employeeNumber ?? "—" },
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
            {
              key: "age",
              header: "Age",
              render: (row) => (row.person?.birthDate ? calculateAge(new Date(row.person.birthDate)) : "—"),
            },
            {
              key: "lengthOfService",
              header: "Length of service",
              render: (row) => (row.currentEmployment?.effectiveFrom ? formatLengthOfService(new Date(row.currentEmployment.effectiveFrom)) : "—"),
            },
          ]}
          rows={roster}
          getRowKey={(row) => row._id.toString()}
          emptyMessage={employmentTypeFilter ? "No employees match this filter." : "No employees yet."}
        />
      </div>
      <PeoplePrintReport rows={exportRows} />
    </>
  );
}
