import Link from "next/link";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { JobOpeningService } from "@/domains/recruitment/job-opening-service";
import { PositionService } from "@/domains/organization/position-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { CreateJobOpeningDialog } from "./create-job-opening-dialog";

export default async function RecruitmentPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("job-openings.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view job openings.</p>;
  }

  const canCreate = await hasPermission("job-openings.create", organizationId);

  const [openings, positions] = await Promise.all([
    JobOpeningService.listCurrent(organizationId),
    PositionService.listCurrent(organizationId),
  ]);
  const positionTitleById = new Map(positions.map((position) => [position._id.toString(), position.title]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Job openings"
        description="Positions currently being recruited for."
        action={
          canCreate ? (
            <CreateJobOpeningDialog
              organizationId={organizationId}
              positions={positions.map((position) => ({ id: position._id.toString(), label: position.title }))}
            />
          ) : undefined
        }
      />
      <DataTable
        caption="Job openings"
        columns={[
          {
            key: "position",
            header: "Position",
            render: (opening) => (
              <Link href={`/recruitment/${opening._id.toString()}`} className="font-medium text-primary hover:underline">
                {positionTitleById.get(opening.positionId.toString()) ?? "—"}
              </Link>
            ),
          },
          { key: "headcount", header: "Headcount", render: (opening) => opening.headcount },
          { key: "status", header: "Status", render: (opening) => <StatusBadge status={opening.status} /> },
          { key: "openedAt", header: "Opened", render: (opening) => new Date(opening.openedAt).toLocaleDateString() },
        ]}
        rows={openings}
        getRowKey={(opening) => opening._id.toString()}
        emptyMessage="No job openings yet."
      />
    </div>
  );
}
