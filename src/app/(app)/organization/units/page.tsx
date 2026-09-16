import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { OrganizationUnitService } from "@/domains/organization/organization-unit-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreateUnitForm } from "./create-unit-form";

export default async function OrganizationUnitsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("organization-units.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view organization units.</p>;
  }

  const units = await OrganizationUnitService.listCurrent(organizationId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Organization units"
        description="Divisions, departments, teams, and other organizational groupings."
      />
      <CreateUnitForm
        organizationId={organizationId}
        units={units.map((unit) => ({ id: unit._id.toString(), name: unit.name }))}
      />
      <DataTable
        columns={[
          { key: "name", header: "Name", render: (unit) => <span className="font-medium">{unit.name}</span> },
          { key: "code", header: "Code", render: (unit) => unit.code },
          { key: "type", header: "Type", render: (unit) => <span className="capitalize">{unit.type}</span> },
          { key: "status", header: "Status", render: (unit) => <StatusBadge status={unit.status} /> },
        ]}
        rows={units}
        getRowKey={(unit) => unit._id.toString()}
        emptyMessage="No organization units yet."
      />
    </div>
  );
}
