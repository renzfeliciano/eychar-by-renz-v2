import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { HideToggle } from "@/components/shared/hide-toggle";
import { DeleteRecordButton } from "@/components/shared/delete-record-button";
import { isSuperAdmin } from "@/app/_shared/is-super-admin";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { accessibleProjects } from "@/app/_shared/accessible-projects";
import { includesProject } from "@/server/authorization";
import { ProjectService } from "@/domains/organization/project-service";
import { LocationService } from "@/domains/organization/location-service";
import { loadHeadcount } from "@/domains/workforce/headcount";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard, MetricStrip } from "@/components/shared/metric-card";
import { CreateProjectDialog } from "./create-project-dialog";
import { EditProjectDialog } from "./edit-project-dialog";
import { NoAccessState } from "@/components/shared/no-access-state";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;

  const organizationId = organization._id.toString();
  const superAdmin = await isSuperAdmin(organizationId);
  // Organization-wide readers see every project; a project-scoped reader (e.g. a Project Manager) only theirs.
  const readable = await accessibleProjects("projects.read", organizationId);
  if (!readable) {
    return <NoAccessState permission="projects.read" message="You don't have access to view projects." />;
  }
  const organizationWide = readable === "all";

  const [projects, locations, canCreate, updatable, headcount] = await Promise.all([
    ProjectService.listCurrent(organizationId, readable),
    LocationService.listCurrent(organizationId),
    hasPermission("projects.create", organizationId),
    accessibleProjects("projects.update", organizationId),
    loadHeadcount(organizationId),
  ]);
  const canUpdate = (projectId: string) => Boolean(updatable && includesProject(updatable, projectId));
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

      <MetricStrip columns={5}>
        <MetricCard label="Active projects" value={active.length} hint={`${projects.length - active.length} closed or inactive`} />
        {organizationWide ? (
          <MetricCard label="Staff on projects" value={headcount.total - headcount.unassigned.project} hint={`of ${headcount.total} current employees`} emphasis />
        ) : (
          <MetricCard
            label="Staff on your projects"
            value={projects.reduce((sum, project) => sum + (headcount.byProject.get(project._id.toString()) ?? 0), 0)}
            hint="Current employees"
            emphasis
          />
        )}
        <MetricCard
          label="Clock-in ready"
          value={`${clockInReady} / ${active.length}`}
          hint="Active projects with a geofenced site"
          tone={clockInReady < active.length ? "warning" : "success"}
        />
        {/* Organization-wide figure: not shown to a viewer scoped to particular projects. */}
        {organizationWide && (
          <MetricCard label="Not on a project" value={headcount.unassigned.project} hint="Current employees" tone={headcount.unassigned.project ? "warning" : "default"} />
        )}
      </MetricStrip>

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
              canUpdate(project._id.toString()) ? (
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
          {
            key: "delete",
            header: "",
            className: "w-10",
            render: (row) =>
              superAdmin ? (
                <span className="flex items-center justify-end gap-0.5">
                  <HideToggle organizationId={organizationId} type="project" id={row._id.toString()} label={String(row.name)} hidden={Boolean(row.hiddenFromOthers)} />
                  <DeleteRecordButton organizationId={organizationId} type="project" id={row._id.toString()} iconOnly />
                </span>
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
