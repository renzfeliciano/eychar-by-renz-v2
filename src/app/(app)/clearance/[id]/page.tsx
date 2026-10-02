import type { Metadata } from "next";
import Link from "next/link";
import { HideToggle } from "@/components/shared/hide-toggle";
import { DeleteRecordButton } from "@/components/shared/delete-record-button";
import { isSuperAdmin } from "@/app/_shared/is-super-admin";
import { notFound } from "next/navigation";
import { AlarmClock, CalendarClock, CircleDollarSign, ListChecks, Zap } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { ClearanceService } from "@/domains/clearance/clearance-service";
import { caseProgress, isItemOverdue } from "@/domains/clearance/clearance-summary";
import { evaluateSource, type ClearanceAutoSource } from "@/domains/clearance/clearance-sources";
import { userDisplayNames } from "@/domains/identity/user-directory";
import { AuditLogModel } from "@/server/db/models";
import { NotFoundError } from "@/shared/errors";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { CLEARANCE_STATUS_LABELS, CLEARANCE_STATUS_TONES, ITEM_STATUS_LABELS, ITEM_STATUS_TONES } from "../clearance-labels";
import { ClearanceItemActions } from "./clearance-item-actions";
import { CancelClearanceButton } from "./cancel-clearance-button";
import { PrepareSettlementButton } from "../../final-settlements/prepare-settlement-button";
import { FinalSettlementService } from "@/domains/final-settlement/final-settlement-service";
import { NoAccessState } from "@/components/shared/no-access-state";
import { formatDate, formatDateTime } from "@/lib/app-time";

export const metadata: Metadata = { title: "Clearance" };

const SHORT = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" } as const;
const DAY_MS = 86_400_000;

export default async function ClearanceCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;
  const organizationId = organization._id.toString();
  const superAdmin = await isSuperAdmin(organizationId);
  if (!(await hasPermission("clearance.read", organizationId))) {
    return <NoAccessState permission="clearance.read" message="You don't have access to view clearances." />;
  }

  const [settlement, canPrepareSettlement] = await Promise.all([
    FinalSettlementService.getByClearance(id, organizationId),
    hasPermission("final-settlements.prepare", organizationId),
  ]);
  const [cases, canSignOff, canWaive, canUpdate] = await Promise.all([
    ClearanceService.listForOrganization(organizationId),
    hasPermission("clearance.sign-off", organizationId),
    hasPermission("clearance.waive", organizationId),
    hasPermission("clearance.update", organizationId),
  ]).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const listed = cases.find((candidate) => candidate._id.toString() === id);
  if (!listed) notFound();
  // Automatic items (assets returned, accounts disabled) catch up with live data on every view.
  const synced = await ClearanceService.syncAutomaticItems(id, organizationId);
  const clearance = { ...listed, status: synced.status, items: synced.items };
  const facts = clearance.items.some((item) => item.autoSource) ? await ClearanceService.sourceFacts(organizationId, clearance.employeeId.toString()) : null;

  const now = new Date();
  const progress = caseProgress(clearance.items, now);
  const editable = clearance.status === "in_clearance" || clearance.status === "cleared";
  const daysToLastDay = Math.ceil((new Date(clearance.lastWorkingDay).getTime() - now.getTime()) / DAY_MS);

  const events = await AuditLogModel.find({ organizationId: organization._id, resourceType: "ClearanceCase", resourceId: clearance._id.toString() }).sort({ createdAt: -1 }).limit(50).lean();
  const names = await userDisplayNames([...events.map((event) => event.actorUserId), ...clearance.items.map((item) => item.actedBy)]);
  const itemsByDepartment = progress.departments.map((department) => ({ ...department, items: clearance.items.filter((item) => item.departmentCode === department.code) }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={clearance.employeeName}
        description={`${clearance.caseNumber} · ${clearance.separationTypeName} · last working day ${new Date(clearance.lastWorkingDay).toLocaleDateString("en-US", SHORT)}`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={clearance.status} label={CLEARANCE_STATUS_LABELS[clearance.status]} tone={CLEARANCE_STATUS_TONES[clearance.status]} />
            {canUpdate && editable && <CancelClearanceButton organizationId={organizationId} caseId={id} />}
            {superAdmin && <HideToggle organizationId={organizationId} type="clearance" id={id} label={clearance.caseNumber} hidden={Boolean((clearance as { hiddenFromOthers?: boolean }).hiddenFromOthers)} />}
            {superAdmin && <DeleteRecordButton organizationId={organizationId} type="clearance" id={id} afterDeleteHref="/clearance" />}
            {(settlement || (canPrepareSettlement && editable)) && (
              <PrepareSettlementButton organizationId={organizationId} clearanceCaseId={id} existingId={settlement?._id.toString()} />
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Items resolved" value={`${progress.resolved} of ${progress.total}`} hint={progress.blockingOpen ? `${progress.blockingOpen} blocking still open` : "Nothing blocks final pay"} icon={ListChecks} emphasis />
        <MetricCard label="Overdue" value={progress.overdue} hint={progress.overdue ? "Past due, still pending" : "Everything is on time"} icon={AlarmClock} tone={progress.overdue ? "danger" : "success"} />
        <MetricCard
          label="Last working day"
          value={daysToLastDay > 0 ? `${daysToLastDay} day${daysToLastDay === 1 ? "" : "s"}` : daysToLastDay === 0 ? "Today" : "Passed"}
          hint={new Date(clearance.lastWorkingDay).toLocaleDateString("en-US", SHORT)}
          icon={CalendarClock}
        />
        <MetricCard label="Flagged amounts" value={formatMoney(progress.flaggedAmount)} hint="Proposed deductions for final settlement" icon={CircleDollarSign} tone={progress.flaggedAmount ? "warning" : "default"} />
      </div>

      {clearance.status === "cancelled" && (
        <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Cancelled: {clearance.cancelReason}. The checklist is frozen as it was.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          {itemsByDepartment.map((department) => (
            <Card key={department.code}>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{department.name}</CardTitle>
                  <CardDescription>
                    {department.resolved} of {department.total} resolved{department.overdue ? ` · ${department.overdue} overdue` : ""}
                  </CardDescription>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    department.resolved === department.total ? "bg-success/12 text-success" : department.overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
                  )}
                >
                  {department.resolved === department.total ? "Done" : department.overdue ? "Overdue" : "In progress"}
                </span>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y border-t">
                  {department.items.map((item) => {
                    const overdue = isItemOverdue(item, now);
                    return (
                      <li key={item._id.toString()} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{item.title}</p>
                            {item.blocking && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">Blocking</span>}
                          </div>
                          <p className={cn("text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                            {overdue ? "Overdue · " : ""}Due {item.dueDate ? new Date(item.dueDate).toLocaleDateString("en-US", SHORT) : "—"}
                            {item.actedAt && item.status !== "pending" && ` · ${ITEM_STATUS_LABELS[item.status].toLowerCase()} by ${names.get(item.actedBy?.toString() ?? "") ?? "system"} on ${formatDate(item.actedAt)}`}
                          </p>
                          {item.autoSource && facts && item.status === "pending" && (() => {
                            const evaluation = evaluateSource(item.autoSource as ClearanceAutoSource, facts);
                            return (
                              <div className="mt-1.5 rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs">
                                <p className="flex items-center gap-1.5 font-medium">
                                  <Zap className="size-3 text-primary" aria-hidden="true" />
                                  {evaluation.autoClears ? "Checked automatically" : "For reference"} · {evaluation.summary}
                                </p>
                                {evaluation.details.length > 0 && (
                                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                                    {evaluation.details.map((detail) => (
                                      <li key={detail}>{detail}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })()}
                          {(item.note || item.amount) && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {item.note}
                              {item.status === "flagged" && item.amount ? <span className="font-medium text-foreground"> · {formatMoney(item.amount)}</span> : null}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 sm:pt-0.5">
                          <StatusBadge status={item.status} label={ITEM_STATUS_LABELS[item.status]} tone={ITEM_STATUS_TONES[item.status]} />
                          {editable && (
                            <ClearanceItemActions
                              organizationId={organizationId}
                              caseId={id}
                              itemId={item._id.toString()}
                              itemTitle={item.title}
                              status={item.status}
                              canSignOff={canSignOff}
                              canWaive={canWaive}
                            />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
          {itemsByDepartment.length === 0 && (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">This clearance has no checklist items. Add items from Clearance › Checklist for future cases.</p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Separation</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                {[
                  ["Employee", <Link key="e" href={`/people/${clearance.employeeId.toString()}`} className="font-medium text-primary hover:underline">{clearance.employeeName}</Link>],
                  ["Type", clearance.separationTypeName],
                  ["Notice received", new Date(clearance.noticeDate).toLocaleDateString("en-US", SHORT)],
                  ["How it was received", clearance.noticeReference || "—"],
                  ["Remarks", clearance.remarks || "—"],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="[overflow-wrap:anywhere]">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
              <CardDescription>Every change, from the audit log</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-3">
                {events.map((event) => {
                  const metadata = (event.metadata ?? {}) as { title?: string; action?: string };
                  const after = (event.after ?? {}) as { status?: string; note?: string; reason?: string };
                  const text =
                    event.action === "clearance.opened"
                      ? "Opened the clearance"
                      : event.action === "clearance.cancelled"
                        ? `Cancelled: ${after.reason ?? ""}`
                        : `${ITEM_STATUS_LABELS[after.status ?? ""] ?? "Updated"}: ${metadata.title ?? "item"}${after.note ? `. ${after.note}` : ""}`;
                  return (
                    <li key={event._id.toString()} className="relative border-l pl-3 text-sm">
                      <span className="absolute top-1.5 -left-[3.5px] size-1.5 rounded-full bg-primary" aria-hidden="true" />
                      <p>{text}</p>
                      <p className="text-xs text-muted-foreground">
                        {names.get(event.actorUserId?.toString() ?? "") ?? "System"} · {formatDateTime(event.createdAt, "short")}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
