import Link from "next/link";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { ReviewCycleService } from "@/domains/performance/review-cycle-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreateReviewCycleDialog } from "./create-review-cycle-dialog";

export default async function PerformancePage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("review-cycles.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view review cycles.</p>;
  }

  const canCreate = await hasPermission("review-cycles.create", organizationId);
  const cycles = await ReviewCycleService.listCurrent(organizationId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Review cycles"
        description="Performance review periods, and the reviews recorded within each."
        action={canCreate ? <CreateReviewCycleDialog organizationId={organizationId} /> : undefined}
      />
      <DataTable
        caption="Review cycles"
        columns={[
          {
            key: "name",
            header: "Name",
            render: (cycle) => (
              <Link href={`/performance/${cycle._id.toString()}`} className="font-medium text-primary hover:underline">
                {cycle.name}
              </Link>
            ),
          },
          { key: "periodStart", header: "Period start", render: (cycle) => new Date(cycle.periodStart).toLocaleDateString() },
          { key: "periodEnd", header: "Period end", render: (cycle) => new Date(cycle.periodEnd).toLocaleDateString() },
          { key: "status", header: "Status", render: (cycle) => <StatusBadge status={cycle.status} /> },
        ]}
        rows={cycles}
        getRowKey={(cycle) => cycle._id.toString()}
        emptyMessage="No review cycles yet."
      />
    </div>
  );
}
