import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, CircleCheck, FilePen, PlayCircle } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { ReviewCycleService } from "@/domains/performance/review-cycle-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { CreateReviewCycleDialog } from "./create-review-cycle-dialog";
import { NoAccessState } from "@/components/shared/no-access-state";
import { formatCalendarDate } from "@/lib/date-key";

export const metadata: Metadata = { title: "Review cycles" };

// Review periods are calendar days (UTC midnight).
const SHORT = { month: "short", day: "numeric", year: "numeric" } as const;

export default async function PerformancePage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("review-cycles.read", organizationId))) {
    return <NoAccessState permission="review-cycles.read" message="You don't have access to view review cycles." />;
  }

  const canCreate = await hasPermission("review-cycles.create", organizationId);
  const cycles = await ReviewCycleService.listCurrent(organizationId);
  const count = (status: string) => cycles.filter((cycle) => cycle.status === status).length;
  const now = new Date().getTime();
  const current = cycles.find((cycle) => cycle.status === "open" && new Date(cycle.periodStart).getTime() <= now && new Date(cycle.periodEnd).getTime() >= now);
  const createAction = canCreate ? <CreateReviewCycleDialog organizationId={organizationId} /> : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Review cycles" description="Performance review periods, and the reviews recorded within each." action={createAction} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Open" value={count("open")} hint={current ? `Current: ${current.name}` : "Accepting reviews"} icon={PlayCircle} emphasis />
        <MetricCard label="Drafts" value={count("draft")} hint="Not open for reviews yet" icon={FilePen} />
        <MetricCard label="Closed" value={count("closed")} hint="Completed cycles" icon={CircleCheck} />
        <MetricCard label="All cycles" value={cycles.length} hint="On record" icon={CalendarRange} />
      </div>

      <DataTable
        caption="Review cycles"
        columns={[
          {
            key: "name",
            header: "Cycle",
            render: (cycle) => (
              <Link href={`/performance/${cycle._id.toString()}`} className="font-medium text-primary hover:underline">
                {cycle.name}
              </Link>
            ),
          },
          {
            key: "period",
            header: "Review period",
            render: (cycle) => (
              <div className="flex flex-col">
                <span>
                  {formatCalendarDate(cycle.periodStart, SHORT)} – {formatCalendarDate(cycle.periodEnd, SHORT)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {Math.max(1, Math.round((new Date(cycle.periodEnd).getTime() - new Date(cycle.periodStart).getTime()) / (30.44 * 86_400_000)))} months
                </span>
              </div>
            ),
          },
          { key: "status", header: "Status", render: (cycle) => <StatusBadge status={cycle.status} /> },
        ]}
        rows={cycles}
        getRowKey={(cycle) => cycle._id.toString()}
        emptyMessage="No review cycles yet."
        emptyDescription="Create a cycle for a review period (e.g. H2 2026), open it, then record each employee's review in it."
        emptyAction={createAction}
      />
    </div>
  );
}
