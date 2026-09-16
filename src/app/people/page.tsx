import Link from "next/link";
import { getCurrentOrganization } from "../_shared/get-current-organization";
import { hasPermission } from "../_shared/has-permission";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { PositionService } from "@/domains/organization/position-service";
import { ProjectService } from "@/domains/organization/project-service";

export default async function PeoplePage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("employees.read", organizationId))) {
    return <p className="text-sm">You don&apos;t have access to view employees.</p>;
  }

  const [roster, positions, projects] = await Promise.all([
    EmployeeService.listWithCurrentStatus(organizationId),
    PositionService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
  ]);
  const positionTitleById = new Map(positions.map((position) => [position._id.toString(), position.title]));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));

  return (
    <main className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">People</h1>
        <Link href="/people/new" className="rounded px-3 py-1.5 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>
          Hire employee
        </Link>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="text-left" style={{ color: "var(--muted)" }}>
            <th className="pb-2">Name</th>
            <th className="pb-2">Employee #</th>
            <th className="pb-2">Employment status</th>
            <th className="pb-2">Position</th>
            <th className="pb-2">Project</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((row) => (
            <tr key={row._id.toString()} className="border-t" style={{ borderColor: "var(--line)" }}>
              <td className="py-2">
                <Link href={`/people/${row._id.toString()}`} style={{ color: "var(--accent)" }}>
                  {row.person ? `${row.person.firstName} ${row.person.lastName}` : "—"}
                </Link>
              </td>
              <td className="py-2">{row.employeeNumber}</td>
              <td className="py-2">{row.currentEmployment?.status ?? "—"}</td>
              <td className="py-2">
                {row.currentAssignment?.positionId ? positionTitleById.get(row.currentAssignment.positionId.toString()) ?? "—" : "—"}
              </td>
              <td className="py-2">
                {row.currentAssignment?.projectId ? projectNameById.get(row.currentAssignment.projectId.toString()) ?? "—" : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {roster.length === 0 && <p className="mt-4 text-sm">No employees yet.</p>}
    </main>
  );
}
