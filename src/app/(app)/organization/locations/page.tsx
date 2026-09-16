import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { LocationService } from "@/domains/organization/location-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreateLocationDialog } from "./create-location-dialog";

export default async function LocationsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("locations.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view locations.</p>;
  }

  const locations = await LocationService.listCurrent(organizationId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Locations"
        description="Physical offices and sites."
        action={<CreateLocationDialog organizationId={organizationId} />}
      />
      <DataTable
        caption="Locations"
        columns={[
          { key: "name", header: "Name", render: (location) => <span className="font-medium">{location.name}</span> },
          { key: "code", header: "Code", render: (location) => location.code },
          { key: "address", header: "Address", render: (location) => location.address ?? "—" },
          { key: "status", header: "Status", render: (location) => <StatusBadge status={location.status} /> },
        ]}
        rows={locations}
        getRowKey={(location) => location._id.toString()}
        emptyMessage="No locations yet."
      />
    </div>
  );
}
