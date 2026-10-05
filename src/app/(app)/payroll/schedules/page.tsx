import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PayrollScheduleService } from "@/domains/payroll/payroll-schedule-service";
import { ProjectService } from "@/domains/organization/project-service";
import { describeCutoffs } from "@/domains/payroll/payroll-labels";
import { PAY_FREQUENCY_LABELS, type PayFrequency } from "@/domains/payroll/engine/pay-frequency";
import { dateToDateKey, formatDateKey, formatDateRange, localDateKey } from "@/lib/date-key";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard, MetricStrip } from "@/components/shared/metric-card";
import { ScheduleDialog } from "./schedule-dialog";
import { PrepareNowButton } from "./prepare-now-button";
import { NoAccessState } from "@/components/shared/no-access-state";

export const metadata: Metadata = { title: "Payroll schedules" };

export default async function PayrollSchedulesPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;
  const organizationId = organization._id.toString();
  if (!(await hasPermission("payroll-schedules.read", organizationId))) {
    return <NoAccessState permission="payroll-schedules.read" message="You don't have access to view payroll schedules." />;
  }

  const [canCreate, canUpdate, canPrepare, schedules, projects] = await Promise.all([
    hasPermission("payroll-schedules.create", organizationId),
    hasPermission("payroll-schedules.update", organizationId),
    hasPermission("payroll-runs.create", organizationId),
    PayrollScheduleService.list(organizationId, localDateKey()),
    ProjectService.listCurrent(organizationId),
  ]);
  const projectOptions = projects.filter((project) => project.status === "active").map((project) => ({ id: project._id.toString(), label: project.name }));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));

  const active = schedules.filter((schedule) => schedule.status !== "inactive");
  const hasOrgWide = active.some((schedule) => !schedule.projectId);
  const projectsScheduled = new Set(active.filter((schedule) => schedule.projectId).map((schedule) => schedule.projectId!.toString())).size;
  const nextCutoff = active.map((schedule) => schedule.currentPeriod?.end).filter((end): end is string => Boolean(end)).sort()[0];
  const failing = active.filter((schedule) => schedule.lastError).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payroll schedules"
        description="Each project's cutoffs and pay day. The day after a cutoff closes, its draft run is prepared automatically for review."
        action={
          <div className="flex items-center gap-2">
            {canPrepare && schedules.length > 0 && <PrepareNowButton organizationId={organizationId} />}
            {canCreate && <ScheduleDialog organizationId={organizationId} projects={projectOptions} />}
          </div>
        }
      />
      <MetricStrip columns={4}>
        <MetricCard label="Active schedules" value={active.length} hint={`${schedules.length - active.length} paused`} emphasis />
        <MetricCard
          label="Projects covered"
          value={hasOrgWide ? "All" : `${projectsScheduled} of ${projects.length}`}
          hint={hasOrgWide ? "An organization-wide schedule covers the rest" : "Projects without one are prepared by hand"}
        />
        <MetricCard label="Next cutoff" value={nextCutoff ? formatDateKey(nextCutoff, { month: "short", day: "numeric" }) : "—"} hint="Its draft is prepared the day after" />
        <MetricCard
          label="Needs attention"
          value={failing}
          hint={failing ? "Last automatic preparation failed" : "Every schedule ran cleanly"}
          tone={failing ? "danger" : "success"}
        />
      </MetricStrip>

      <DataTable
        caption="Payroll schedules"
        columns={[
          {
            key: "name",
            header: "Schedule",
            render: (schedule) => (
              <div className="flex flex-col">
                <span className="font-medium">{schedule.name}</span>
                <span className="text-xs text-muted-foreground">{schedule.projectId ? (projectNameById.get(schedule.projectId.toString()) ?? "Project") : "All projects"}</span>
              </div>
            ),
          },
          {
            key: "cutoffs",
            header: "Cutoffs",
            render: (schedule) => (
              <div className="flex flex-col">
                <span>{PAY_FREQUENCY_LABELS[schedule.payFrequency as PayFrequency]}</span>
                <span className="text-xs text-muted-foreground">
                  {describeCutoffs(schedule.payFrequency, schedule.cutoffDay)}; paid {schedule.payDateOffsetDays} days after
                </span>
              </div>
            ),
          },
          {
            key: "current",
            header: "Current cutoff",
            render: (schedule) => (
              <div className="flex flex-col">
                <span className="tabular-nums">{formatDateRange(schedule.currentPeriod.start, schedule.currentPeriod.end)}</span>
                <span className="text-xs text-muted-foreground">Pay date {formatDateKey(schedule.currentPeriod.payDate)}</span>
              </div>
            ),
          },
          {
            key: "last",
            header: "Last prepared",
            render: (schedule) =>
              schedule.lastError ? (
                <span className="flex items-start gap-1.5 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {schedule.lastError}
                </span>
              ) : schedule.lastRunId ? (
                <div className="flex flex-col">
                  <Link href={`/payroll/${schedule.lastRunId.toString()}`} className="font-medium text-primary hover:underline">
                    {schedule.lastRunNumber ?? "View run"}
                  </Link>
                  {schedule.lastPreparedPeriodEnd && (
                    <span className="text-xs text-muted-foreground">Cutoff {formatDateKey(dateToDateKey(schedule.lastPreparedPeriodEnd))}</span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">Not yet</span>
              ),
          },
          {
            key: "mode",
            header: "Mode",
            render: (schedule) =>
              schedule.status !== "active" ? (
                <StatusBadge status="inactive" />
              ) : schedule.autoPrepare ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  <CalendarClock className="size-3" aria-hidden="true" />
                  Automatic
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">Manual</span>
              ),
          },
          {
            key: "action",
            header: "",
            className: "w-10",
            render: (schedule) =>
              canUpdate ? (
                <ScheduleDialog
                  organizationId={organizationId}
                  projects={projectOptions}
                  schedule={{
                    id: schedule._id.toString(),
                    name: schedule.name,
                    projectId: schedule.projectId?.toString() ?? "",
                    payFrequency: schedule.payFrequency as PayFrequency,
                    cutoffDay: schedule.cutoffDay,
                    payDateOffsetDays: schedule.payDateOffsetDays,
                    autoPrepare: schedule.autoPrepare,
                    status: schedule.status as "active" | "inactive",
                  }}
                />
              ) : null,
          },
        ]}
        rows={schedules}
        getRowKey={(schedule) => schedule._id.toString()}
        emptyMessage="No payroll schedules yet. Add one per project (or one for everyone) to have each cutoff's draft prepared automatically."
      />

      <p className="text-xs text-muted-foreground">
        Drafts are prepared the day after each cutoff, from the daily job and whenever the payroll screen is opened. Nothing is submitted, approved or paid without a person doing it.
      </p>
    </div>
  );
}
