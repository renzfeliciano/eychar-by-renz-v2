import { FolderKanban, MapPin, Navigation, Users } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { ProjectService } from "@/domains/organization/project-service";
import { LocationService } from "@/domains/organization/location-service";
import { loadHeadcount } from "@/domains/workforce/headcount";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { CreateProjectDialog } from "./create-project-dialog";
import { EditProjectDialog } from "./edit-project-dialog";

export default async function ProjectsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("projects.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view projects.</p>;
  }

  const [projects, locations, canCreate, canUpdate, headcount] = await Promise.all([
    ProjectService.listCurrent(organizationId),
    LocationService.listCurrent(organizationId),
    hasPermission("projects.create", organizationId),
    hasPermission("projects.update", organizationId),
    loadHeadcount(organizationId),
  ]);
  const locationById = new Map(locations.map((location) => [location._id.toString(), location]));
  const locationOptions = locations.map((location) => ({ id: location._id.toString(), label: location.name }));
  const active = projects.filter((project) => project.status === "active");
  const isClockInReady = (project: (typeof projects)[number]) => {
    const location = project.locationId ? locationById.get(project.locationId.toString()) : undefined;
    return project.status === "active" && location?.status === "active" && typeof location.latitude === "number" && typeof location.longitude === "number";
  };
  const clockInReady = active.filter(isClockInReady).length;
  const createAction = canCreate ? (
    <CreateProjectDialog organizationId={organizationId} locations={locations.map((location) => ({ id: location._id.toString(), name: location.name }))} />
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Projects" description="Operational projects and client engagements. Payroll, schedules and clock-in can all run per project." action={createAction} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Active projects" value={active.length} hint={`${projects.length - active.length} closed or inactive`} icon={FolderKanban} />
        <MetricCard label="Staff on projects" value={headcount.total - headcount.unassigned.project} hint={`of ${headcount.total} current employees`} icon={Users} emphasis />
        <MetricCard
          label="Clock-in ready"
          value={`${clockInReady} / ${active.length}`}
          hint="Active projects with a geofenced site"
          icon={Navigation}
          tone={clockInReady < active.length ? "warning" : "success"}
        />
        <MetricCard label="Not on a project" value={headcount.unassigned.project} hint="Current employees" icon={MapPin} tone={headcount.unassigned.project ? "warning" : "default"} />
      </div>

      <DataTable
        caption="Projects"
        columns={[
          {
            key: "name",
            header: "Project",
            render: (project) => (
              <div className="flex flex-col">
                <span className="font-medium">{project.name}</span>
                {project.description && <span className="max-w-72 truncate text-xs text-muted-foreground">{project.description}</span>}
              </div>
            ),
          },
          {
            key: "headcount",
            header: "Headcount",
            className: "text-right",
            render: (project) => <span className="font-medium tabular-nums">{headcount.byProject.get(project._id.toString()) ?? 0}</span>,
          },
          {
            key: "location",
            header: "Location",
            render: (project) => (project.locationId ? (locationById.get(project.locationId.toString())?.name ?? "—") : "—"),
          },
          {
            key: "clockIn",
            header: "Clock-in",
            render: (project) => {
              const location = project.locationId ? locationById.get(project.locationId.toString()) : undefined;
              if (isClockInReady(project)) {
                return (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-primary" aria-hidden="true" />
                    Within {location?.geofenceRadiusMeters ?? 100} m
                  </span>
                );
              }
              const reason = !location ? "No location" : location.status !== "active" ? "Location inactive" : project.status !== "active" ? "Project inactive" : "Location has no coordinates";
              return <span className="text-muted-foreground">{reason}</span>;
            },
          },
          { key: "status", header: "Status", render: (project) => <StatusBadge status={project.status} /> },
          {
            key: "action",
            header: "",
            render: (project) =>
              canUpdate ? (
                <EditProjectDialog
                  organizationId={organizationId}
                  project={{
                    id: project._id.toString(),
                    name: project.name,
                    description: project.description ?? null,
                    locationId: project.locationId?.toString() ?? null,
                  }}
                  locations={locationOptions}
                />
              ) : null,
          },
        ]}
        rows={projects}
        getRowKey={(project) => project._id.toString()}
        emptyMessage="No projects yet."
        emptyDescription="Add the client engagements and sites your people work on."
        emptyAction={createAction}
      />
    </div>
  );
}
