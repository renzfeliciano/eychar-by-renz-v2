import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Ban, CalendarClock, Check, OctagonAlert, Undo2 } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { ProjectService } from "@/domains/organization/project-service";
import { userDisplayNames } from "@/domains/identity/user-directory";
import { PAYROLL_RUN_STATUS_LABELS, PAYROLL_RUN_STEPS, formatPeso, type PayrollRunStatus } from "@/domains/payroll/payroll-labels";
import { PAY_FREQUENCY_LABELS, type PayFrequency } from "@/domains/payroll/engine/pay-frequency";
import { NotFoundError } from "@/shared/errors";
import { dateToDateKey, formatDateKey, formatDateRange } from "@/lib/date-key";
import { formatDateTime } from "@/lib/app-time";
import { payPremiumsOf } from "@/domains/payroll/engine/premiums";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard, MetricStrip } from "@/components/shared/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PayrollStatusBadge } from "../payroll-status-badge";
import { RunActions } from "./run-actions";
import { RunRegister } from "./run-register";
import type { AdjustmentRow, RegisterRow } from "./run-types";
import { NoAccessState } from "@/components/shared/no-access-state";

export const metadata: Metadata = { title: "Payroll run" };

const HISTORY_LABELS: Record<string, string> = {
  prepared: "Prepared",
  recomputed: "Recomputed",
  submitted: "Submitted for approval",
  approved: "Approved",
  returned: "Returned to draft",
  released: "Released",
  cancelled: "Cancelled",
};

const formatTimestamp = (value: Date) => formatDateTime(value);

/** "SSS, EC, PhilHealth, Pag-IBIG": the employer-paid contributions this run's rule version defines, in its order. */
function employerShareLabel(rules: { name: string; extraLabel?: string | null }[]): string {
  const names = rules.flatMap((rule) => (rule.extraLabel ? [rule.name, rule.extraLabel] : [rule.name]));
  return [...new Set(names)].join(", ") || "No contributions";
}

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("payroll-runs.read", organizationId))) {
    return <NoAccessState permission="payroll-runs.read" message="You don't have access to view this payroll run." />;
  }

  let detail;
  try {
    detail = await PayrollRunService.getDetail(id, organizationId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { run, records, adjustments, policy, ruleVersion } = detail;

  const [canUpdate, canApprove, canRelease, projects] = await Promise.all([
    hasPermission("payroll-runs.update", organizationId),
    hasPermission("payroll.approve", organizationId),
    hasPermission("payroll.release", organizationId),
    ProjectService.listCurrent(organizationId),
  ]);
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const history = run.history ?? [];
  const userNames = await userDisplayNames(history.map((entry: { by?: unknown }) => entry.by as string));

  const status = run.status as PayrollRunStatus;
  const scopeLabel = run.projectId ? (projectNameById.get(run.projectId.toString()) ?? "Project") : "All projects";
  const periodLabel = formatDateRange(dateToDateKey(run.payPeriodStart), dateToDateKey(run.payPeriodEnd));
  const totals = run.totals ?? { employees: 0, grossPay: 0, employeeContributions: 0, employerContributions: 0, tax: 0, otherDeductions: 0, netPay: 0 };
  const lastEntry = history.at(-1);
  const wasReturned = status === "draft" && lastEntry?.action === "returned";
  const whoDid = (by?: unknown) => (by ? (userNames.get(String(by)) ?? "Someone") : "Payroll schedule");

  const registerRows: RegisterRow[] = records.map((record) => ({
    id: record._id.toString(),
    employeeId: record.employeeId.toString(),
    employeeNumber: record.employeeNumber,
    employeeName: record.employeeName,
    projectName: record.projectId ? (projectNameById.get(record.projectId.toString()) ?? null) : null,
    rateType: record.rateType as "monthly" | "daily",
    rate: record.rate,
    dailyRate: record.dailyRate,
    hourlyRate: record.hourlyRate,
    attendance: {
      scheduledDays: record.attendance?.scheduledDays ?? 0,
      eligibleDays: record.attendance?.eligibleDays ?? 0,
      daysWorked: record.attendance?.daysWorked ?? 0,
      paidLeaveDays: record.attendance?.paidLeaveDays ?? 0,
      absentDays: record.attendance?.absentDays ?? 0,
      missingDays: record.attendance?.missingDays ?? 0,
      restDaysWorked: record.attendance?.restDaysWorked ?? 0,
      lateMinutes: record.attendance?.lateMinutes ?? 0,
      undertimeMinutes: record.attendance?.undertimeMinutes ?? 0,
    },
    earnings: record.earnings.map((line: { code: string; label: string; amount: number; taxable: boolean }) => ({ code: line.code, label: line.label, amount: line.amount, taxable: line.taxable })),
    contributions: record.contributions.map((line: { code: string; name: string; employee: number; employer: number; extra: number; extraLabel?: string | null }) => ({
      code: line.code,
      name: line.name,
      employee: line.employee,
      employer: line.employer,
      extra: line.extra,
      extraLabel: line.extraLabel ?? null,
    })),
    deductions: record.deductions.map((line: { code: string; label: string; amount: number }) => ({ code: line.code, label: line.label, amount: line.amount })),
    grossPay: record.grossPay,
    taxableIncome: record.taxableIncome,
    tax: record.tax,
    employeeContributions: record.employeeContributions,
    employerContributions: record.employerContributions,
    totalDeductions: record.totalDeductions,
    netPay: record.netPay,
    previousNetPay: record.previousNetPay ?? null,
    warnings: record.warnings.map((warning: { code: string; message: string; blocking: boolean }) => ({ code: warning.code, message: warning.message, blocking: warning.blocking })),
  }));
  const adjustmentRows: AdjustmentRow[] = adjustments.map((adjustment) => ({
    id: adjustment._id.toString(),
    employeeId: adjustment.employeeId.toString(),
    category: adjustment.category,
    label: adjustment.label,
    direction: adjustment.direction as "earning" | "deduction",
    amount: adjustment.amount,
    taxable: adjustment.taxable,
    notes: adjustment.notes ?? null,
  }));

  // When each step on the main path was last reached (a return resets later steps).
  const reachedAt = new Map<string, { at: Date; by?: unknown }>();
  for (const entry of history) {
    if (entry.action === "returned") {
      reachedAt.delete("submitted");
      reachedAt.delete("approved");
    }
    if (["prepared", "submitted", "approved", "released"].includes(entry.action)) reachedAt.set(entry.status, { at: entry.at, by: entry.by });
  }
  const currentStepIndex = PAYROLL_RUN_STEPS.indexOf(status);
  // The rules this run used; a run without its rule version (never expected) falls back to what its records computed.
  const contributionRules: { name: string; extraLabel?: string | null }[] =
    ruleVersion?.contributions ?? records.flatMap((record) => record.contributions as { name: string; extraLabel?: string | null }[]);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/payroll" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Payroll runs
      </Link>

      <PageHeader
        title={run.runNumber}
        description={`${scopeLabel} · ${periodLabel} · Pay date ${formatDateKey(dateToDateKey(run.payDate))}`}
        action={
          <RunActions
            runId={run._id.toString()}
            runNumber={run.runNumber}
            organizationId={organizationId}
            status={status}
            canUpdate={canUpdate}
            canApprove={canApprove}
            canRelease={canRelease}
            blockingIssues={run.blockingIssues ?? 0}
            employees={totals.employees}
            netPayLabel={formatPeso(totals.netPay)}
          />
        }
      />

      {/* Lifecycle: where this run is, and who moved it there. */}
      {status === "cancelled" ? (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm" role="status">
          <Ban className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">Cancelled {run.cancelledAt ? formatTimestamp(run.cancelledAt) : ""}</p>
            <p className="text-muted-foreground">{run.cancelReason}</p>
          </div>
        </div>
      ) : (
        <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border shadow-[var(--shadow-soft)] sm:grid-cols-4" aria-label="Payroll run progress">
          {PAYROLL_RUN_STEPS.map((step, index) => {
            const reached = reachedAt.get(step);
            const done = index < currentStepIndex || (index === currentStepIndex && step === "released");
            const current = index === currentStepIndex && step !== "released";
            return (
              <li
                key={step}
                aria-current={current ? "step" : undefined}
                className={cn("relative flex items-center gap-3 bg-card px-4 py-3", current && "bg-accent/50 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary")}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    done && "border-primary bg-primary text-primary-foreground",
                    current && "border-primary text-primary",
                    !done && !current && "text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-sm font-medium", !done && !current && "text-muted-foreground")}>{PAYROLL_RUN_STATUS_LABELS[step]}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {reached && (done || current) ? `${whoDid(reached.by)} · ${formatDateKey(dateToDateKey(new Date(reached.at)), { month: "short", day: "numeric" })}` : current ? "In progress" : "Not yet"}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {wasReturned && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm" role="status">
          <Undo2 className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <p className="font-medium">Returned by {whoDid(lastEntry?.by)}</p>
            <p className="text-muted-foreground">{lastEntry?.note}</p>
          </div>
        </div>
      )}
      {(run.blockingIssues ?? 0) > 0 && status === "draft" && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          <OctagonAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-medium">
              {run.blockingIssues} {run.blockingIssues === 1 ? "payslip needs" : "payslips need"} fixing before this run can be submitted.
            </span>{" "}
            Open the flagged payslips below.
          </p>
        </div>
      )}
      {(run.exclusions?.length ?? 0) > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium">
              {run.exclusions.length} {run.exclusions.length === 1 ? "employee isn't" : "employees aren't"} in this run
            </p>
            <ul className="mt-1 text-muted-foreground">
              {run.exclusions.map((exclusion: { employeeId: unknown; employeeName: string; reason: string }) => (
                <li key={String(exclusion.employeeId)}>
                  {exclusion.employeeName}: {exclusion.reason}.{" "}
                  <Link href="/payroll/compensation" className="text-primary hover:underline">
                    Set pay terms
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <MetricStrip columns={5}>
        <MetricCard label="Employees" value={totals.employees} hint={run.warningCount ? `${run.warningCount} to review` : "No warnings"} />
        <MetricCard label="Gross pay" value={formatPeso(totals.grossPay)} />
        <MetricCard
          label="Deductions"
          value={formatPeso(totals.employeeContributions + totals.tax + totals.otherDeductions)}
          hint={`Contributions ${formatPeso(totals.employeeContributions)} · tax ${formatPeso(totals.tax)}`}
        />
        <MetricCard label="Net pay" value={formatPeso(totals.netPay)} hint={`Pay date ${formatDateKey(dateToDateKey(run.payDate), { month: "short", day: "numeric" })}`} emphasis />
        <MetricCard label="Employer share" value={formatPeso(totals.employerContributions)} hint={employerShareLabel(contributionRules)} className="col-span-2 lg:col-span-1" />
      </MetricStrip>

      <RunRegister
        runId={run._id.toString()}
        organizationId={organizationId}
        records={registerRows}
        adjustments={adjustmentRows}
        editable={status === "draft" && canUpdate}
        overtimeMultiplier={payPremiumsOf(policy).overtimeMultiplier}
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>Every step on this run, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="relative flex flex-col gap-4 border-l pl-5">
              {[...history].reverse().map((entry: { action: string; status: string; at: Date; by?: unknown; note?: string }, index: number) => (
                <li key={`${entry.action}-${index}`} className="relative">
                  <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card bg-primary" aria-hidden="true" />
                  <p className="text-sm">
                    <span className="font-medium">{HISTORY_LABELS[entry.action] ?? entry.action}</span>
                    <span className="text-muted-foreground"> by {whoDid(entry.by)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{formatTimestamp(entry.at)}</p>
                  {entry.note && <p className="mt-1 rounded-md bg-muted/50 px-2 py-1 text-sm">{entry.note}</p>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Computed with</CardTitle>
            <CardDescription>Kept with the run, so it can always be explained.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Payroll policy</dt>
                <dd>
                  {policy?.name ?? "—"}
                  {policy ? ` · ${PAY_FREQUENCY_LABELS[policy.payFrequency as PayFrequency]}, ${policy.workDaysPerYear} workdays a year` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Rule version</dt>
                <dd>
                  {ruleVersion ? (
                    <Link href={`/payroll/rule-versions/${ruleVersion._id.toString()}`} className="text-primary hover:underline">
                      v{ruleVersion.versionNumber} · {ruleVersion.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Contributions</dt>
                <dd>{policy?.contributionTiming === "last_cutoff_of_month" ? "Whole month on the last cutoff" : "Split across cutoffs"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last computed</dt>
                <dd>{run.computedAt ? formatTimestamp(run.computedAt) : "—"}</dd>
              </div>
              {run.source?.type === "schedule" && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CalendarClock className="size-3.5" aria-hidden="true" />
                  Prepared automatically by a payroll schedule
                </div>
              )}
              {status === "released" && (
                <div>
                  <dt className="text-xs text-muted-foreground">Paid</dt>
                  <dd>
                    {run.releasedOn ? formatDateKey(dateToDateKey(run.releasedOn)) : "—"}
                    {run.paymentReference ? ` · ${run.paymentReference}` : ""}
                  </dd>
                </div>
              )}
              <div className="pt-1">
                <PayrollStatusBadge status={status} />
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
