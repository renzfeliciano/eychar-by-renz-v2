import Link from "next/link";
import { CalendarClock, CircleCheck, FilePen, Hourglass, Wallet } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { PayrollScheduleService } from "@/domains/payroll/payroll-schedule-service";
import { ProjectService } from "@/domains/organization/project-service";
import { userDisplayNames } from "@/domains/identity/user-directory";
import { PAYROLL_RUN_STATUS_LABELS, formatPeso } from "@/domains/payroll/payroll-labels";
import { dateToDateKey, formatDateKey, formatDateRange, localDateKey } from "@/lib/date-key";
import { parseTableQuery, applyTableQuery, buildTableHref } from "@/lib/table-query";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { MetricCard } from "@/components/shared/metric-card";
import { cn } from "@/lib/utils";
import { PayrollStatusBadge } from "./payroll-status-badge";
import { NewRunDialog, type RunSuggestion } from "./new-run-dialog";

type SearchParams = Record<string, string | string[] | undefined>;
const STATUS_FILTERS = ["all", "draft", "submitted", "approved", "released", "cancelled"] as const;

export default async function PayrollRunsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("payroll-runs.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view payroll runs.</p>;
  }
  const canCreate = await hasPermission("payroll-runs.create", organizationId);

  // Catch up on scheduled drafts whose cutoff has closed, so they're here
  // even if the daily cron didn't run. Idempotent; failures are recorded
  // on the schedule and shown on the schedules screen.
  if (canCreate) await PayrollScheduleService.prepareDue({ organizationId }).catch(() => []);

  const today = localDateKey();
  const [runs, projects, schedules] = await Promise.all([
    PayrollRunService.list(organizationId),
    ProjectService.listCurrent(organizationId),
    PayrollScheduleService.list(organizationId, today),
  ]);
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const userNames = await userDisplayNames(runs.map((run) => run.preparedBy));

  const statusFilter = (STATUS_FILTERS as readonly string[]).includes(String(params.status)) ? String(params.status) : "all";
  const countByStatus = new Map<string, number>();
  for (const run of runs) countByStatus.set(run.status, (countByStatus.get(run.status) ?? 0) + 1);
  const visibleRuns = statusFilter === "all" ? runs : runs.filter((run) => run.status === statusFilter);

  const tableQuery = parseTableQuery(params, "period");
  const { rows: pageRows, total } = applyTableQuery(visibleRuns, tableQuery, {
    searchFields: (run) => [run.runNumber, run.projectId ? projectNameById.get(run.projectId.toString()) : "All projects"],
    sortValues: {
      period: (run) => new Date(run.payPeriodStart),
      payDate: (run) => new Date(run.payDate),
      netPay: (run) => run.totals?.netPay ?? 0,
      status: (run) => run.status,
    },
  });

  const year = today.slice(0, 4);
  const releasedThisYear = runs.filter((run) => run.status === "released" && dateToDateKey(run.payDate).startsWith(year));
  const nextPayDate = schedules
    .filter((schedule) => schedule.status === "active")
    .map((schedule) => schedule.currentPeriod.payDate)
    .sort()[0];

  const suggestions: RunSuggestion[] = schedules
    .filter((schedule) => schedule.status === "active")
    .flatMap((schedule) =>
      [schedule.lastClosedPeriod, schedule.currentPeriod].map((period) => ({
        key: `${schedule._id.toString()}-${period.end}`,
        scheduleName: schedule.name,
        projectId: schedule.projectId?.toString() ?? "",
        ...period,
      })),
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payroll runs"
        description="Prepare, review and approve each cutoff's payroll, per project or for everyone, then release it once paid."
        action={
          canCreate ? (
            <NewRunDialog organizationId={organizationId} projects={projects.map((project) => ({ id: project._id.toString(), label: project.name }))} suggestions={suggestions} />
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Drafts" value={countByStatus.get("draft") ?? 0} hint="Being prepared" icon={FilePen} />
        <MetricCard label="Awaiting approval" value={countByStatus.get("submitted") ?? 0} hint="Submitted for approval" icon={Hourglass} />
        <MetricCard label="Ready to release" value={countByStatus.get("approved") ?? 0} hint="Approved, not yet paid" icon={CircleCheck} />
        <MetricCard
          label={`Released in ${year}`}
          value={formatPeso(releasedThisYear.reduce((sum, run) => sum + (run.totals?.netPay ?? 0), 0))}
          hint={nextPayDate ? `Next scheduled pay date ${formatDateKey(nextPayDate, { month: "short", day: "numeric" })}` : `${releasedThisYear.length} runs paid`}
          icon={Wallet}
          emphasis
        />
      </div>

      <div className="flex flex-col gap-3">
        <nav aria-label="Filter by status" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {STATUS_FILTERS.map((status) => {
            const count = status === "all" ? runs.length : (countByStatus.get(status) ?? 0);
            const active = statusFilter === status;
            return (
              <Link
                key={status}
                href={buildTableHref("/payroll", params, { status: status === "all" ? undefined : status, page: undefined })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-[color,background-color,border-color] duration-150",
                  active ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:border-ring/50 hover:text-foreground",
                )}
              >
                {status === "all" ? "All" : PAYROLL_RUN_STATUS_LABELS[status]}
                <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{count}</span>
              </Link>
            );
          })}
        </nav>

        <DataTable
          caption="Payroll runs"
          sort={{
            sortBy: tableQuery.sort,
            sortDir: tableQuery.dir,
            buildHref: (sortKey) => buildTableHref("/payroll", params, { sort: sortKey, dir: tableQuery.sort === sortKey && tableQuery.dir === "asc" ? "desc" : "asc", page: undefined }),
          }}
          pagination={{ page: tableQuery.page, pageSize: tableQuery.pageSize, total, buildHref: (page, pageSize) => buildTableHref("/payroll", params, { page, pageSize }) }}
          columns={[
            {
              key: "run",
              header: "Run",
              render: (run) => (
                <div className="flex flex-col">
                  <Link href={`/payroll/${run._id.toString()}`} className="font-medium text-primary hover:underline" data-testid="payroll-run-link">
                    {run.runNumber}
                  </Link>
                  {run.source?.type === "schedule" && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarClock className="size-3" aria-hidden="true" />
                      Scheduled
                    </span>
                  )}
                </div>
              ),
            },
            { key: "scope", header: "Scope", render: (run) => (run.projectId ? (projectNameById.get(run.projectId.toString()) ?? "Project") : "All projects") },
            { key: "period", header: "Period", sortKey: "period", render: (run) => formatDateRange(dateToDateKey(run.payPeriodStart), dateToDateKey(run.payPeriodEnd)) },
            { key: "payDate", header: "Pay date", sortKey: "payDate", render: (run) => formatDateKey(dateToDateKey(run.payDate)) },
            { key: "employees", header: "Employees", className: "text-right", render: (run) => <span className="tabular-nums">{run.totals?.employees ?? 0}</span> },
            {
              key: "netPay",
              header: "Net pay",
              sortKey: "netPay",
              className: "text-right",
              render: (run) => <span className="font-medium tabular-nums">{formatPeso(run.totals?.netPay ?? 0)}</span>,
            },
            { key: "status", header: "Status", sortKey: "status", render: (run) => <PayrollStatusBadge status={run.status} /> },
            {
              key: "preparedBy",
              header: "Prepared by",
              render: (run) => <span className="text-muted-foreground">{run.preparedBy ? (userNames.get(run.preparedBy.toString()) ?? "—") : "Payroll schedule"}</span>,
            },
          ]}
          rows={pageRows}
          getRowKey={(run) => run._id.toString()}
          emptyMessage={statusFilter === "all" ? "No payroll runs yet. Prepare one, or set up a payroll schedule to prepare them automatically." : "No runs with this status."}
        />
      </div>
    </div>
  );
}
