import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { ProjectService } from "@/domains/organization/project-service";
import { LocationService } from "@/domains/organization/location-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreateProjectForm } from "./create-project-form";

export default async function ProjectsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("projects.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view projects.</p>;
  }

  const [projects, locations] = await Promise.all([
    ProjectService.listCurrent(organizationId),
    LocationService.listCurrent(organizationId),
  ]);
  const locationNameById = new Map(locations.map((location) => [location._id.toString(), location.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Projects" description="Operational projects and client engagements." />
      <CreateProjectForm
        organizationId={organizationId}
        locations={locations.map((location) => ({ id: location._id.toString(), name: location.name }))}
      />
      <DataTable
        columns={[
          { key: "name", header: "Name", render: (project) => <span className="font-medium">{project.name}</span> },
          { key: "code", header: "Code", render: (project) => project.code },
          {
            key: "location",
            header: "Location",
            render: (project) => (project.locationId ? locationNameById.get(project.locationId.toString()) ?? "—" : "—"),
          },
          { key: "status", header: "Status", render: (project) => <StatusBadge status={project.status} /> },
        ]}
        rows={projects}
        getRowKey={(project) => project._id.toString()}
        emptyMessage="No projects yet."
      />
    </div>
  );
}
