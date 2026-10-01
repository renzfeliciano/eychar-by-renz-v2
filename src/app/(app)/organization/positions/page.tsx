import { Briefcase, BriefcaseBusiness, CircleDashed, Users } from "lucide-react";
import { HideToggle } from "@/components/shared/hide-toggle";
import { DeleteRecordButton } from "@/components/shared/delete-record-button";
import { isSuperAdmin } from "@/app/_shared/is-super-admin";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PositionService } from "@/domains/organization/position-service";
import { loadHeadcount } from "@/domains/workforce/headcount";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { CreatePositionDialog } from "./create-position-dialog";

export default async function PositionsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  const superAdmin = await isSuperAdmin(organizationId);
  if (!(await hasPermission("positions.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view positions.</p>;
  }

  const [positions, headcount] = await Promise.all([PositionService.listCurrent(organizationId), loadHeadcount(organizationId)]);
  const active = positions.filter((position) => position.status === "active");
  const filled = active.filter((position) => (headcount.byPosition.get(position._id.toString()) ?? 0) > 0).length;
  const createAction = <CreatePositionDialog organizationId={organizationId} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Positions" description="Job positions employees can be assigned to, and how many people hold each." action={createAction} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Active positions" value={active.length} hint={`${positions.length - active.length} retired`} icon={Briefcase} />
        <MetricCard label="Filled" value={filled} hint="Held by at least one employee" icon={BriefcaseBusiness} emphasis />
        <MetricCard label="Vacant" value={active.length - filled} hint="No one assigned yet" icon={CircleDashed} tone={active.length - filled ? "warning" : "default"} />
        <MetricCard label="Without a position" value={headcount.unassigned.position} hint={`of ${headcount.total} current employees`} icon={Users} tone={headcount.unassigned.position ? "warning" : "success"} />
      </div>

      <DataTable
        caption="Positions"
        columns={[
          { key: "title", header: "Position", render: (position) => <span className="font-medium">{position.title}</span> },
          {
            key: "headcount",
            header: "Headcount",
            className: "text-right",
            render: (position) => {
              const count = headcount.byPosition.get(position._id.toString()) ?? 0;
              return count ? <span className="font-medium tabular-nums">{count}</span> : <span className="text-muted-foreground">Vacant</span>;
            },
          },
          { key: "status", header: "Status", render: (position) => <StatusBadge status={position.status} /> },
          {
            key: "delete",
            header: "",
            className: "w-10",
            render: (row) =>
              superAdmin ? (
                <span className="flex items-center justify-end gap-0.5">
                  <HideToggle organizationId={organizationId} type="position" id={row._id.toString()} label={String(row.title)} hidden={Boolean(row.hiddenFromOthers)} />
                  <DeleteRecordButton organizationId={organizationId} type="position" id={row._id.toString()} iconOnly />
                </span>
              ) : null,
          },
        ]}
        rows={positions}
        getRowKey={(position) => position._id.toString()}
        emptyMessage="No positions yet."
        emptyDescription="Add the job titles you hire for; each employee's assignment points to one."
        emptyAction={createAction}
      />
    </div>
  );
}
