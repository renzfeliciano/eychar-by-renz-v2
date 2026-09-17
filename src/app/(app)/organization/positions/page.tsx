import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PositionService } from "@/domains/organization/position-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreatePositionDialog } from "./create-position-dialog";

export default async function PositionsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("positions.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view positions.</p>;
  }

  const positions = await PositionService.listCurrent(organizationId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Positions"
        description="Job positions employees can be assigned to."
        action={<CreatePositionDialog organizationId={organizationId} />}
      />
      <DataTable
        caption="Positions"
        columns={[
          { key: "title", header: "Title", render: (position) => <span className="font-medium">{position.title}</span> },
          { key: "status", header: "Status", render: (position) => <StatusBadge status={position.status} /> },
        ]}
        rows={positions}
        getRowKey={(position) => position._id.toString()}
        emptyMessage="No positions yet."
      />
    </div>
  );
}
