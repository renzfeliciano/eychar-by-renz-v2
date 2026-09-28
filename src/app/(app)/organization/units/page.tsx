import { Building2, Layers, Users, UserX } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { OrganizationUnitService } from "@/domains/organization/organization-unit-service";
import { loadHeadcount } from "@/domains/workforce/headcount";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { CreateUnitDialog } from "./create-unit-dialog";

export default async function OrganizationUnitsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("organization-units.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view organization units.</p>;
  }

  const [units, headcount] = await Promise.all([OrganizationUnitService.listCurrent(organizationId), loadHeadcount(organizationId)]);
  const unitById = new Map(units.map((unit) => [unit._id.toString(), unit]));
  const activeUnits = units.filter((unit) => unit.status === "active");
  const types = new Set(units.map((unit) => unit.type));
  const createAction = <CreateUnitDialog organizationId={organizationId} units={units.map((unit) => ({ id: unit._id.toString(), name: unit.name }))} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Organization units" description="Divisions, departments, teams, and other organizational groupings." action={createAction} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Active units" value={activeUnits.length} hint={`${units.length - activeUnits.length} retired`} icon={Building2} />
        <MetricCard label="Unit types" value={types.size} hint={[...types].slice(0, 3).join(", ") || "None yet"} icon={Layers} />
        <MetricCard label="Staff in units" value={headcount.total - headcount.unassigned.unit} hint={`of ${headcount.total} current employees`} icon={Users} emphasis />
        <MetricCard label="Not in a unit" value={headcount.unassigned.unit} hint={headcount.unassigned.unit ? "Assign them from their profile" : "Everyone is placed"} icon={UserX} tone={headcount.unassigned.unit ? "warning" : "success"} />
      </div>

      <DataTable
        caption="Organization units"
        columns={[
          {
            key: "name",
            header: "Unit",
            render: (unit) => {
              const parent = unit.parentUnitId ? unitById.get(unit.parentUnitId.toString()) : undefined;
              return (
                <div className="flex flex-col">
                  <span className="font-medium">{unit.name}</span>
                  <span className="text-xs text-muted-foreground">{parent ? `Under ${parent.name}` : "Top level"}</span>
                </div>
              );
            },
          },
          { key: "code", header: "Code", render: (unit) => <span className="font-mono text-xs">{unit.code}</span> },
          { key: "type", header: "Type", render: (unit) => <span className="capitalize">{unit.type}</span> },
          { key: "headcount", header: "Headcount", className: "text-right", render: (unit) => <span className="font-medium tabular-nums">{headcount.byUnit.get(unit._id.toString()) ?? 0}</span> },
          { key: "status", header: "Status", render: (unit) => <StatusBadge status={unit.status} /> },
        ]}
        rows={units}
        getRowKey={(unit) => unit._id.toString()}
        emptyMessage="No organization units yet."
        emptyDescription="Add your divisions and departments, then place employees in them from their profiles."
        emptyAction={createAction}
      />
    </div>
  );
}
