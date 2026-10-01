import Link from "next/link";
import { HideToggle } from "@/components/shared/hide-toggle";
import { DeleteRecordButton } from "@/components/shared/delete-record-button";
import { isSuperAdmin } from "@/app/_shared/is-super-admin";
import { notFound } from "next/navigation";
import { AlarmClock, ArrowDownRight, ArrowUpRight, Info, Wallet } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { FinalSettlementService } from "@/domains/final-settlement/final-settlement-service";
import { ClearanceService } from "@/domains/clearance/clearance-service";
import { PaymentMethodService } from "@/domains/catalog/payment-method-service";
import { userDisplayNames } from "@/domains/identity/user-directory";
import { NotFoundError } from "@/shared/errors";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PESO, SETTLEMENT_STATUS_LABELS, SETTLEMENT_STATUS_TONES, daysToDeadline, deadlineDaysOf } from "../settlement-labels";
import { SettlementActions } from "./settlement-actions";
import { ManualLineForm } from "./manual-line-form";
import { RemoveLineButton } from "./remove-line-button";

const SHORT = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" } as const;
const WHEN = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;
const HISTORY_LABELS: Record<string, string> = {
  prepared: "Prepared",
  recomputed: "Recomputed",
  submitted: "Submitted for review",
  reviewed: "Reviewed",
  approved: "Approved",
  returned: "Returned for correction",
  disbursed: "Paid",
  cancelled: "Cancelled",
};

type Line = { code: string; direction: string; label: string; amount: number; source: string; basis: string; manualLineId?: string | null };

function LinesTable({ title, lines, total, tone, removable }: { title: string; lines: Line[]; total: number; tone: "earning" | "deduction"; removable: ((line: Line) => React.ReactNode) | null }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {tone === "earning" ? <ArrowUpRight className="size-4 text-success" aria-hidden="true" /> : <ArrowDownRight className="size-4 text-destructive" aria-hidden="true" />}
          {title}
        </CardTitle>
        <span className="font-semibold tabular-nums">{PESO.format(total)}</span>
      </CardHeader>
      <CardContent className="p-0">
        {lines.length === 0 ? (
          <p className="border-t px-4 py-6 text-center text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="divide-y border-t">
            {lines.map((line, index) => (
              <li key={`${line.code}-${index}`} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{line.label}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">{line.source}</span> · {line.basis}
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums">{PESO.format(line.amount)}</span>
                {removable?.(line)}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default async function FinalSettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;
  const organizationId = organization._id.toString();
  const superAdmin = await isSuperAdmin(organizationId);
  if (!(await hasPermission("final-settlements.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view final settlements.</p>;
  }

  const settlement = await FinalSettlementService.getById(id, organizationId).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [clearances, methods, canPrepare, canReview, canApprove, canDisburse] = await Promise.all([
    ClearanceService.listForOrganization(organizationId),
    PaymentMethodService.listCurrent(organizationId),
    hasPermission("final-settlements.prepare", organizationId),
    hasPermission("final-settlements.review", organizationId),
    hasPermission("final-settlements.approve", organizationId),
    hasPermission("final-settlements.disburse", organizationId),
  ]);
  const clearance = clearances.find((candidate) => candidate._id.toString() === settlement.clearanceCaseId.toString());
  if (!clearance) notFound();

  const names = await userDisplayNames(settlement.history.map((entry) => entry.by));
  const methodName = new Map(methods.map((method) => [method.code, method.name]));
  const now = new Date();
  const deadlineDays = deadlineDaysOf(settlement) ?? 0;
  const daysLeft = daysToDeadline(clearance.lastWorkingDay, now, deadlineDays);
  const lines = settlement.lines as Line[];
  const editable = settlement.status === "draft" && canPrepare;
  const removable = editable
    ? (line: Line) => (line.manualLineId ? <RemoveLineButton organizationId={organizationId} settlementId={id} lineId={line.manualLineId} label={line.label} /> : null)
    : null;
  const totals = settlement.totals ?? { earnings: 0, deductions: 0, net: 0 };
  const inputs = (settlement.inputs ?? {}) as { dailyRate?: number; lastPaidThrough?: string | null; rateType?: string; rate?: number };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Final settlement: ${clearance.employeeName}`}
        description={`${clearance.caseNumber} · ${clearance.separationTypeName} · last working day ${new Date(clearance.lastWorkingDay).toLocaleDateString("en-US", SHORT)} · version ${settlement.version}`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={settlement.status} label={SETTLEMENT_STATUS_LABELS[settlement.status]} tone={SETTLEMENT_STATUS_TONES[settlement.status]} />
            {superAdmin && <HideToggle organizationId={organizationId} type="final-settlement" id={id} label="This settlement" hidden={Boolean((settlement as { hiddenFromOthers?: boolean }).hiddenFromOthers)} />}
            {superAdmin && <DeleteRecordButton organizationId={organizationId} type="final-settlement" id={id} afterDeleteHref="/final-settlements" />}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Net pay" value={PESO.format(totals.net)} hint={totals.net < 0 ? "Balance due from the employee" : "To be paid to the employee"} icon={Wallet} emphasis tone={totals.net < 0 ? "danger" : "default"} />
        <MetricCard label="Earnings" value={PESO.format(totals.earnings)} hint={`${lines.filter((line) => line.direction === "earning").length} lines`} icon={ArrowUpRight} />
        <MetricCard label="Deductions" value={PESO.format(totals.deductions)} hint={`${lines.filter((line) => line.direction === "deduction").length} lines`} icon={ArrowDownRight} />
        <MetricCard
          label="Pay by"
          value={settlement.status === "disbursed" ? "Paid" : daysLeft < 0 ? `${-daysLeft} days overdue` : `${daysLeft} days left`}
          hint={`${deadlineDays} days after separation, per the payroll policy`}
          icon={AlarmClock}
          tone={settlement.status === "disbursed" ? "success" : daysLeft < 0 ? "danger" : daysLeft <= 7 ? "warning" : "default"}
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-medium">
              {settlement.status === "disbursed"
                ? `Paid by ${methodName.get(settlement.payment?.methodCode ?? "") ?? settlement.payment?.methodCode} · ${settlement.payment?.reference}`
                : settlement.status === "cancelled"
                  ? "This settlement was cancelled."
                  : "Next step"}
            </p>
            <p className="text-muted-foreground">
              Clearance:{" "}
              <Link href={`/clearance/${clearance._id.toString()}`} className="text-primary hover:underline">
                {clearance.status === "cleared" ? "cleared" : clearance.status === "closed" ? "closed" : "still in progress"}
              </Link>
            </p>
          </div>
          <SettlementActions
            organizationId={organizationId}
            settlementId={id}
            clearanceCaseId={clearance._id.toString()}
            status={settlement.status}
            clearanceCleared={clearance.status === "cleared"}
            permissions={{ canPrepare, canReview, canApprove, canDisburse }}
            paymentMethods={methods.filter((method) => method.status === "active").map((method) => ({ id: method.code, label: method.name }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          <LinesTable title="Earnings" lines={lines.filter((line) => line.direction === "earning")} total={totals.earnings} tone="earning" removable={removable} />
          <LinesTable title="Deductions" lines={lines.filter((line) => line.direction === "deduction")} total={totals.deductions} tone="deduction" removable={removable} />
          {editable && <ManualLineForm organizationId={organizationId} settlementId={id} />}
          <p className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Withholding tax true-up and statutory contributions for the final period aren&apos;t computed here yet. Add them as manual lines if needed until that phase ships.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Computed with</CardTitle>
              <CardDescription>Frozen once approved</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-sm">
                {[
                  ["Pay terms", inputs.rate ? `${PESO.format(inputs.rate)} ${inputs.rateType === "daily" ? "a day" : "a month"}` : "—"],
                  ["Daily rate", inputs.dailyRate ? PESO.format(inputs.dailyRate) : "—"],
                  ["Paid through", inputs.lastPaidThrough ? new Date(`${inputs.lastPaidThrough}T00:00:00Z`).toLocaleDateString("en-US", SHORT) : "No payroll this year"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-3">
                {[...settlement.history].reverse().map((entry, index) => (
                  <li key={`${entry.action}-${index}`} className="relative border-l pl-3 text-sm">
                    <span className={cn("absolute top-1.5 -left-[3.5px] size-1.5 rounded-full", entry.action === "returned" || entry.action === "cancelled" ? "bg-destructive" : "bg-primary")} aria-hidden="true" />
                    <p>
                      {HISTORY_LABELS[entry.action] ?? entry.action}
                      {entry.version ? <span className="text-muted-foreground"> · v{entry.version}</span> : null}
                    </p>
                    {entry.note && <p className="text-xs text-muted-foreground">{entry.note}</p>}
                    <p className="text-xs text-muted-foreground">
                      {names.get(entry.by?.toString() ?? "") ?? "System"} · {new Date(entry.at).toLocaleString("en-US", WHEN)}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
