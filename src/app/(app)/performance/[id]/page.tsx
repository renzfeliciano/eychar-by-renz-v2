import Link from "next/link";
import { CalendarClock, CircleCheck, FilePen, UserRoundX, Users } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { ReviewCycleService } from "@/domains/performance/review-cycle-service";
import { PerformanceReviewService } from "@/domains/performance/performance-review-service";
import { summarizeReviewCycle } from "@/domains/performance/review-cycle-summary";
import { PerformanceRatingService } from "@/domains/catalog/performance-rating-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { loadCurrentStaffCheck } from "@/domains/attendance/current-staff";
import { formatPersonName } from "@/lib/person-name";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { HorizontalBarChart } from "@/components/shared/horizontal-bar-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddReviewDialog } from "./add-review-dialog";
import { SubmitReviewDialog } from "./submit-review-dialog";
import { CycleStatusButton } from "./cycle-status-button";

const SHORT = { month: "short", day: "numeric", year: "numeric" } as const;
// Ratings are ordinal (best to worst in catalog order), so they use the ordinal ramp, not identity colors.
const ORDINAL = ["var(--viz-ordinal-4)", "var(--viz-ordinal-3)", "var(--viz-ordinal-2)", "var(--viz-ordinal-1)"];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

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

  const [cycle, reviews, roster, ratings, isCurrentStaff] = await Promise.all([
    ReviewCycleService.getById(id, organizationId),
    PerformanceReviewService.listForCycle(id, organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
    PerformanceRatingService.listCurrent(organizationId),
    loadCurrentStaffCheck(organizationId),
  ]);

  const employeeOptions = roster.filter((row) => row.person).map((row) => ({ id: row._id.toString(), label: formatPersonName(row.person) }));
  const nameByEmployeeId = new Map(employeeOptions.map((option) => [option.id, option.label]));
  const ratingOptions = ratings.map((rating) => ({ id: rating.code, label: rating.name }));
  const ratingNameByCode = new Map(ratings.map((rating) => [rating.code, rating.name]));
  const staff = roster.filter((row) => row.person && isCurrentStaff(row.currentEmployment?.status));

  const summary = summarizeReviewCycle({
    staffIds: staff.map((row) => row._id.toString()),
    reviews,
    ratings: ratings.map((rating) => ({ code: rating.code, name: rating.name })),
    periodEnd: new Date(cycle.periodEnd),
    now: new Date(),
  });
  const distribution = summary.distribution.map((row, index) => ({ label: row.name, count: row.count, color: ORDINAL[Math.min(index, ORDINAL.length - 1)] }));
  const period = `${new Date(cycle.periodStart).toLocaleDateString("en-US", SHORT)} – ${new Date(cycle.periodEnd).toLocaleDateString("en-US", SHORT)}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={cycle.name}
        description={`Review period ${period}`}
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

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Coverage" value={`${summary.completion}%`} hint={`${summary.reviewed} of ${summary.staff} current staff have a review`} icon={Users} emphasis />
        <MetricCard label="Submitted" value={summary.submitted} hint="Final, with a rating" icon={CircleCheck} tone={summary.submitted ? "success" : "default"} />
        <MetricCard label="Drafts" value={summary.drafts} hint={summary.drafts ? "Started, not yet submitted" : "No drafts waiting"} icon={FilePen} tone={summary.drafts ? "warning" : "default"} />
        <MetricCard
          label={cycle.status === "closed" ? "Period" : "Days left"}
          value={cycle.status === "closed" ? "Closed" : summary.daysLeft}
          hint={cycle.status === "closed" ? "No more reviews can be added" : `Period ends ${new Date(cycle.periodEnd).toLocaleDateString("en-US", SHORT)}`}
          icon={CalendarClock}
          tone={cycle.status !== "closed" && summary.daysLeft <= 7 && summary.notReviewedIds.length ? "warning" : "default"}
        />
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Review coverage" aria-valuenow={summary.completion} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${summary.completion}%` }} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rating distribution</CardTitle>
            <CardDescription>Submitted reviews, best to lowest rating</CardDescription>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              buckets={distribution}
              ariaLabel="Submitted reviews by rating"
              labelClassName="w-32 sm:w-40"
              emptyTitle="No submitted reviews yet"
              emptyDescription="Ratings show here as reviews are submitted."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Not reviewed yet
              {summary.notReviewedIds.length > 0 && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning tabular-nums">{summary.notReviewedIds.length}</span>}
            </CardTitle>
            <CardDescription>Current staff with no review in this cycle</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.notReviewedIds.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CircleCheck className="size-4 text-success" aria-hidden="true" />
                Everyone has a review.
              </p>
            ) : (
              <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                {summary.notReviewedIds.map((employeeId) => (
                  <li key={employeeId}>
                    <Link href={`/people/${employeeId}`} className="flex items-center gap-2.5 rounded-md px-1.5 py-1 text-sm hover:bg-muted">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground" aria-hidden="true">
                        {initials(nameByEmployeeId.get(employeeId) ?? "?")}
                      </span>
                      <span className="truncate">{nameByEmployeeId.get(employeeId)}</span>
                      <UserRoundX className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <DataTable
        caption="Reviews"
        columns={[
          {
            key: "employee",
            header: "Employee",
            render: (review) => {
              const name = nameByEmployeeId.get(review.employeeId.toString()) ?? "—";
              return (
                <Link href={`/people/${review.employeeId.toString()}`} className="flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">
                    {initials(name)}
                  </span>
                  <span className="font-medium hover:text-primary">{name}</span>
                </Link>
              );
            },
          },
          { key: "reviewer", header: "Reviewer", render: (review) => nameByEmployeeId.get(review.reviewerId.toString()) ?? "—" },
          {
            key: "rating",
            header: "Rating",
            render: (review) =>
              review.ratingCode ? (
                <span className="inline-flex rounded-full border px-2 py-0.5 text-xs font-medium">{ratingNameByCode.get(review.ratingCode) ?? review.ratingCode}</span>
              ) : (
                <span className="text-muted-foreground">Not rated</span>
              ),
          },
          { key: "status", header: "Status", render: (review) => <StatusBadge status={review.status} /> },
          {
            key: "submitted",
            header: "Submitted",
            render: (review) => <span className="text-muted-foreground">{review.submittedAt ? new Date(review.submittedAt).toLocaleDateString("en-US", SHORT) : "—"}</span>,
          },
          {
            key: "action",
            header: "",
            render: (review) =>
              canUpdateReview && review.status === "draft" ? <SubmitReviewDialog organizationId={organizationId} reviewId={review._id.toString()} ratings={ratingOptions} /> : null,
          },
        ]}
        rows={reviews}
        getRowKey={(review) => review._id.toString()}
        emptyMessage="No reviews recorded for this cycle yet."
        emptyDescription={cycle.status === "draft" ? "Open the cycle, then add a review for each employee." : "Add a review for each employee in the period."}
      />
    </div>
  );
}
