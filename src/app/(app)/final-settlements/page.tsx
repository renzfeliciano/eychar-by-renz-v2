import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, Banknote, ClipboardCheck, Hourglass } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { FinalSettlementService } from "@/domains/final-settlement/final-settlement-service";
import { ClearanceService } from "@/domains/clearance/clearance-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import { PrepareSettlementButton } from "./prepare-settlement-button";
import { formatMoney } from "@/lib/money";
import { SETTLEMENT_STATUS_LABELS, SETTLEMENT_STATUS_TONES, daysToDeadline, deadlineDaysOf } from "./settlement-labels";
import { NoAccessState } from "@/components/shared/no-access-state";

export const metadata: Metadata = { title: "Final settlement" };

const SHORT = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" } as const;

export default async function FinalSettlementsPage() {
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;
  const organizationId = organization._id.toString();
  if (!(await hasPermission("final-settlements.read", organizationId))) {
    return <NoAccessState permission="final-settlements.read" message="You don't have access to view final settlements." />;
  }

  const [settlements, clearances, canPrepare] = await Promise.all([
    FinalSettlementService.listForOrganization(organizationId),
    ClearanceService.listForOrganization(organizationId),
    hasPermission("final-settlements.prepare", organizationId),
  ]);
  const clearanceById = new Map(clearances.map((clearance) => [clearance._id.toString(), clearance]));
  const settledCaseIds = new Set(settlements.map((settlement) => settlement.clearanceCaseId.toString()));
  const waiting = clearances.filter((clearance) => clearance.active && !settledCaseIds.has(clearance._id.toString()));

  const now = new Date();
  const rows = settlements.map((settlement) => ({
    id: settlement._id.toString(),
    settlement: { ...settlement, totals: settlement.totals ?? { earnings: 0, deductions: 0, net: 0 } },
    clearance: clearanceById.get(settlement.clearanceCaseId.toString()),
  }));
  const open = rows.filter(({ settlement }) => !["disbursed", "cancelled"].includes(settlement.status));
  const overdue = open.filter(({ settlement, clearance }) => {
    const deadlineDays = deadlineDaysOf(settlement);
    return clearance && deadlineDays !== null && daysToDeadline(clearance.lastWorkingDay, now, deadlineDays) < 0;
  }).length;
  const toPay = rows.filter(({ settlement }) => settlement.status === "approved");
  const paidThisMonth = rows.filter(({ settlement }) => settlement.status === "disbursed" && settlement.payment?.paidAt && new Date(settlement.payment.paidAt).getMonth() === now.getMonth() && new Date(settlement.payment.paidAt).getFullYear() === now.getFullYear());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Final settlement" description="Last pay for separated employees: computed from their records, reviewed by HR, approved by Finance, and paid by the deadline set on the payroll policy." />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="In progress" value={open.length} hint={`${waiting.length} clearance${waiting.length === 1 ? "" : "s"} not started yet`} icon={Hourglass} emphasis />
        <MetricCard label="Past the deadline" value={overdue} hint={overdue ? "Past the payroll policy's final pay deadline" : "Everything is within its deadline"} icon={AlarmClock} tone={overdue ? "danger" : "success"} />
        <MetricCard label="Approved, to pay" value={formatMoney(toPay.reduce((sum, { settlement }) => sum + Math.max(settlement.totals.net, 0), 0))} hint={`${toPay.length} settlement${toPay.length === 1 ? "" : "s"}`} icon={Banknote} tone={toPay.length ? "warning" : "default"} />
        <MetricCard label="Paid this month" value={paidThisMonth.length} hint={formatMoney(paidThisMonth.reduce((sum, { settlement }) => sum + settlement.totals.net, 0))} icon={ClipboardCheck} />
      </div>

      {waiting.length > 0 && canPrepare && (
        <section aria-label="Clearances without a settlement" className="flex flex-col gap-2 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium">Ready to prepare</h2>
          <ul className="divide-y">
            {waiting.map((clearance) => (
              <li key={clearance._id.toString()} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/clearance/${clearance._id.toString()}`} className="text-sm font-medium hover:text-primary">
                    {clearance.employeeName}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {clearance.caseNumber} · last day {new Date(clearance.lastWorkingDay).toLocaleDateString("en-US", SHORT)} · clearance {clearance.status === "cleared" ? "cleared" : "in progress"}
                  </p>
                </div>
                <PrepareSettlementButton organizationId={organizationId} clearanceCaseId={clearance._id.toString()} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <DataTable
        caption="Final settlements"
        columns={[
          {
            key: "employee",
            header: "Employee",
            render: ({ settlement, clearance }) => (
              <Link href={`/final-settlements/${settlement._id.toString()}`} className="flex flex-col">
                <span className="font-medium hover:text-primary">{clearance?.employeeName ?? "Employee"}</span>
                <span className="text-xs text-muted-foreground">
                  {clearance?.caseNumber} · v{settlement.version}
                </span>
              </Link>
            ),
          },
          {
            key: "lastDay",
            header: "Last day",
            render: ({ clearance }) => (clearance ? <span className="tabular-nums">{new Date(clearance.lastWorkingDay).toLocaleDateString("en-US", SHORT)}</span> : "—"),
          },
          {
            key: "deadline",
            header: "Pay by", mobile: "hidden",
            render: ({ settlement, clearance }) => {
              const deadlineDays = deadlineDaysOf(settlement);
              if (!clearance || deadlineDays === null || ["disbursed", "cancelled"].includes(settlement.status)) return <span className="text-muted-foreground">—</span>;
              const days = daysToDeadline(clearance.lastWorkingDay, now, deadlineDays);
              return <span className={cn("text-sm tabular-nums", days < 0 ? "font-medium text-destructive" : days <= 7 ? "text-warning" : "")}>{days < 0 ? `${-days} days overdue` : `${days} days left`}</span>;
            },
          },
          {
            key: "net",
            header: "Net pay",
            className: "text-right",
            render: ({ settlement }) => <span className={cn("font-medium tabular-nums", settlement.totals.net < 0 && "text-destructive")}>{formatMoney(settlement.totals.net)}</span>,
          },
          { key: "status", header: "Status", render: ({ settlement }) => <StatusBadge status={settlement.status} label={SETTLEMENT_STATUS_LABELS[settlement.status]} tone={SETTLEMENT_STATUS_TONES[settlement.status]} /> },
        ]}
        rows={rows}
        getRowKey={(row) => row.id}
        emptyMessage="No final settlements yet."
        emptyDescription="Prepare one from a clearance once the employee's separation is underway."
      />
    </div>
  );
}
