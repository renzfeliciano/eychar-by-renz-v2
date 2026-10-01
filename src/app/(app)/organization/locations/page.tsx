import { Building, MapPin, Navigation, Users } from "lucide-react";
import { DeleteRecordButton } from "@/components/shared/delete-record-button";
import { isSuperAdmin } from "@/app/_shared/is-super-admin";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { LocationService } from "@/domains/organization/location-service";
import { loadHeadcount } from "@/domains/workforce/headcount";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { CreateLocationDialog } from "./create-location-dialog";
import { EditLocationDialog } from "./edit-location-dialog";

export default async function LocationsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  const superAdmin = await isSuperAdmin(organizationId);
  if (!(await hasPermission("locations.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view locations.</p>;
  }

  const [locations, canCreate, canUpdate, headcount] = await Promise.all([
    LocationService.listCurrent(organizationId),
    hasPermission("locations.create", organizationId),
    hasPermission("locations.update", organizationId),
    loadHeadcount(organizationId),
  ]);
  const active = locations.filter((location) => location.status === "active");
  const sites = active.filter((location) => typeof location.latitude === "number" && typeof location.longitude === "number");
  const withoutCoordinates = active.length - sites.length;
  const createAction = canCreate ? <CreateLocationDialog organizationId={organizationId} /> : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Locations"
        description="Physical offices and sites. A location with coordinates becomes a clock-in site for its projects."
        action={createAction}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Active locations" value={active.length} hint={`${locations.length - active.length} retired`} icon={Building} />
        <MetricCard label="Clock-in sites" value={sites.length} hint="With coordinates and a radius" icon={Navigation} emphasis />
        <MetricCard
          label="Without coordinates"
          value={withoutCoordinates}
          hint={withoutCoordinates ? "Not usable for clock-in yet" : "All are clock-in ready"}
          icon={MapPin}
          tone={withoutCoordinates ? "warning" : "success"}
        />
        <MetricCard label="Staff placed" value={headcount.total - headcount.unassigned.location} hint={`of ${headcount.total} current employees`} icon={Users} />
      </div>

      <DataTable
        caption="Locations"
        columns={[
          {
            key: "name",
            header: "Location",
            render: (location) => (
              <div className="flex flex-col">
                <span className="font-medium">{location.name}</span>
                <span className="max-w-72 truncate text-xs text-muted-foreground">{location.address ?? "No address"}</span>
              </div>
            ),
          },
          { key: "code", header: "Code", render: (location) => <span className="font-mono text-xs">{location.code}</span> },
          {
            key: "headcount",
            header: "Headcount",
            className: "text-right",
            render: (location) => <span className="font-medium tabular-nums">{headcount.byLocation.get(location._id.toString()) ?? 0}</span>,
          },
          {
            key: "site",
            header: "Clock-in site",
            render: (location) =>
              typeof location.latitude === "number" && typeof location.longitude === "number" ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-primary" aria-hidden="true" />
                  Within {location.geofenceRadiusMeters ?? 100} m
                </span>
              ) : (
                <span className="text-muted-foreground">Not set</span>
              ),
          },
          { key: "status", header: "Status", render: (location) => <StatusBadge status={location.status} /> },
          {
            key: "action",
            header: "",
            render: (location) =>
              canUpdate ? (
                <EditLocationDialog
                  organizationId={organizationId}
                  location={{
                    id: location._id.toString(),
                    name: location.name,
                    code: location.code,
                    address: location.address ?? null,
                    latitude: location.latitude ?? null,
                    longitude: location.longitude ?? null,
                    geofenceRadiusMeters: location.geofenceRadiusMeters ?? null,
                  }}
                />
              ) : null,
          },
          {
            key: "delete",
            header: "",
            className: "w-10",
            render: (row) =>
              superAdmin ? <DeleteRecordButton organizationId={organizationId} type="location" id={row._id.toString()} iconOnly /> : null,
          },
        ]}
        rows={locations}
        getRowKey={(location) => location._id.toString()}
        emptyMessage="No locations yet."
        emptyDescription="Add offices and sites. Give a site coordinates and a radius to use it for geofenced clock-in."
        emptyAction={createAction}
      />
    </div>
  );
}
