import { getCurrentOrganization } from "../_shared/get-current-organization";
import { hasPermission } from "../_shared/has-permission";
import { ProjectService } from "@/domains/organization/project-service";
import { LocationService } from "@/domains/organization/location-service";
import { CreateProjectForm } from "./create-project-form";

export default async function ProjectsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("projects.read", organizationId))) {
    return <p className="text-sm">You don&apos;t have access to view projects.</p>;
  }

  const [projects, locations] = await Promise.all([
    ProjectService.listCurrent(organizationId),
    LocationService.listCurrent(organizationId),
  ]);
  const locationNameById = new Map(locations.map((location) => [location._id.toString(), location.name]));

  return (
    <section>
      <CreateProjectForm
        organizationId={organizationId}
        locations={locations.map((location) => ({ id: location._id.toString(), name: location.name }))}
      />

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="text-left" style={{ color: "var(--muted)" }}>
            <th className="pb-2">Name</th>
            <th className="pb-2">Code</th>
            <th className="pb-2">Location</th>
            <th className="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project._id.toString()} className="border-t" style={{ borderColor: "var(--line)" }}>
              <td className="py-2">{project.name}</td>
              <td className="py-2">{project.code}</td>
              <td className="py-2">
                {project.locationId ? locationNameById.get(project.locationId.toString()) ?? "—" : "—"}
              </td>
              <td className="py-2">{project.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {projects.length === 0 && <p className="mt-4 text-sm">No projects yet.</p>}
    </section>
  );
}
