import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { ReviewCycleService } from "@/domains/performance/review-cycle-service";
import { PerformanceReviewService } from "@/domains/performance/performance-review-service";
import { PerformanceRatingService } from "@/domains/catalog/performance-rating-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { formatPersonName } from "@/lib/person-name";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { AddReviewDialog } from "./add-review-dialog";
import { SubmitReviewDialog } from "./submit-review-dialog";
import { CycleStatusButton } from "./cycle-status-button";

export default async function ReviewCycleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("review-cycles.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view review cycles.</p>;
  }

  const [canUpdateCycle, canCreateReview, canUpdateReview] = await Promise.all([
    hasPermission("review-cycles.update", organizationId),
    hasPermission("performance-reviews.create", organizationId),
    hasPermission("performance-reviews.update", organizationId),
  ]);

  const [cycle, reviews, roster, ratings] = await Promise.all([
    ReviewCycleService.getById(id, organizationId),
    PerformanceReviewService.listForCycle(id, organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
    PerformanceRatingService.listCurrent(organizationId),
  ]);

  const employeeOptions = roster
    .filter((row) => row.person)
    .map((row) => ({ id: row._id.toString(), label: formatPersonName(row.person) }));
  const nameByEmployeeId = new Map(employeeOptions.map((option) => [option.id, option.label]));
  const ratingOptions = ratings.map((rating) => ({ id: rating.code, label: rating.name }));
  const ratingNameByCode = new Map(ratings.map((rating) => [rating.code, rating.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={cycle.name}
        description={`${new Date(cycle.periodStart).toLocaleDateString()} – ${new Date(cycle.periodEnd).toLocaleDateString()}`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={cycle.status} />
            {canUpdateCycle && cycle.status === "draft" && (
              <CycleStatusButton reviewCycleId={id} organizationId={organizationId} nextStatus="open" label="Open cycle" loadingLabel="Opening…" />
            )}
            {canUpdateCycle && cycle.status === "open" && (
              <CycleStatusButton reviewCycleId={id} organizationId={organizationId} nextStatus="closed" label="Close cycle" loadingLabel="Closing…" />
            )}
            {canCreateReview && <AddReviewDialog organizationId={organizationId} reviewCycleId={id} employees={employeeOptions} />}
          </div>
        }
      />
      <DataTable
        caption="Reviews"
        columns={[
          { key: "employee", header: "Employee", render: (review) => nameByEmployeeId.get(review.employeeId.toString()) ?? "—" },
          { key: "reviewer", header: "Reviewer", render: (review) => nameByEmployeeId.get(review.reviewerId.toString()) ?? "—" },
          { key: "rating", header: "Rating", render: (review) => (review.ratingCode ? ratingNameByCode.get(review.ratingCode) ?? review.ratingCode : "—") },
          { key: "status", header: "Status", render: (review) => <StatusBadge status={review.status} /> },
          {
            key: "action",
            header: "",
            render: (review) =>
              canUpdateReview && review.status === "draft" ? (
                <SubmitReviewDialog organizationId={organizationId} reviewId={review._id.toString()} ratings={ratingOptions} />
              ) : null,
          },
        ]}
        rows={reviews}
        getRowKey={(review) => review._id.toString()}
        emptyMessage="No reviews recorded for this cycle yet."
      />
    </div>
  );
}
