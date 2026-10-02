import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Banknote, ListChecks, CalendarRange, UsersRound, UserPlus, LogOut, History, AlarmClock, UserX, CalendarDays, CheckCircle2, FileClock, FileText, Flag, Plane, Palmtree, Cake, Clock, Scale, UserCheck, type LucideIcon } from "lucide-react";
import { hourInAppZone } from "@/lib/app-time";
import { OrganizationService } from "@/domains/organization/organization-service";
import { hasPermission } from "@/app/_shared/has-permission";
import { userDisplayNames } from "@/domains/identity/user-directory";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { LeaveRequestService } from "@/domains/leave/leave-request-service";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { AttendanceService } from "@/domains/attendance/attendance-service";
import { EventService } from "@/domains/events/event-service";
import { TravelOrderService } from "@/domains/travel-orders/travel-order-service";
import { CaseService } from "@/domains/cases/case-service";
import { closedCaseCodes, isOpenCase } from "@/domains/cases/case-summary";
import { CaseStatusService } from "@/domains/catalog/case-status-service";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { greetingFor, upcomingEvents } from "@/domains/dashboard/dashboard-summary";
import { documentRisks, finalPayRisks, regularizationRisks, RISK_WINDOW_DAYS } from "@/domains/dashboard/compliance-risks";
import { EmploymentTypeService } from "@/domains/catalog/employment-type-service";
import { catalogNumber } from "@/domains/catalog/catalog-flags";
import { ClearanceService } from "@/domains/clearance/clearance-service";
import { FinalSettlementService } from "@/domains/final-settlement/final-settlement-service";
import { EmployeeDocumentService } from "@/domains/documents/employee-document-service";
import { HolidayService } from "@/domains/holidays/holiday-service";
import { HOLIDAY_TYPE_LABELS } from "@/domains/holidays/holiday-types";
import { collapseKind, rankActions, relativeDue, urgencyFor, type ActionItem, type ActionUrgency } from "@/domains/dashboard/action-queue";
import { dateToDateKey, formatDateKey, localDateKey } from "@/lib/date-key";
import { formatPersonName } from "@/lib/person-name";
import { calculateAge } from "@/lib/employee-dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { NoAccessState } from "@/components/shared/no-access-state";
import { getSession } from "@/server/auth/session";
import { AuditQueryService } from "@/server/audit/audit-query-service";
import { describeAuditAction } from "@/domains/identity/security-event-labels";
import { formatTime } from "@/lib/app-time";
import { formatRelativeDays } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const COMING_UP_DAYS = 30;
/** The timeline shows this many entries, then links to the calendar. */
const UPCOMING_SHOWN = 15;
const CONTRACT_WINDOW_DAYS = 30;
/** Past this many rows of one kind, they collapse into one summary row. */
const ROWS_PER_KIND = 5;
const NAMES_SHOWN = 8;
/** Final pay deadline when the organization hasn't set its own (DOLE Labor Advisory No. 06-2020). */
const DEFAULT_FINAL_PAY_DAYS = 30;
/**
 * Probation length for the platform-seeded "probationary" type when the
 * catalog item predates the setting; an explicit `regularizeAfterMonths` on
 * any employment type (Setup › Catalogs) always wins.
 */
const LEGACY_REGULARIZATION_MONTHS = { probationary: 6 } as const;

const shortDate = (key: string) => formatDateKey(key, { month: "short", day: "numeric" });
const dateRange = (start: string, end: string) => (start === end ? shortDate(start) : `${shortDate(start)}–${shortDate(end)}`);

function addDays(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextMonthKey(todayKey: string): string {
  const [year, month] = todayKey.split("-").map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

const covers = (start: Date, end: Date, key: string) => dateToDateKey(new Date(start)) <= key && dateToDateKey(new Date(end)) >= key;

/**
 * The dashboard is a to-do list, not a report: what needs doing (ranked,
 * each with a button straight to it), who's out today, and what's coming up.
 * No statistics or charts. Every section is read only when the viewer may
 * see that module, and actions are listed only when they may take them.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  const [organizations, displayNames] = await Promise.all([OrganizationService.listAccessibleTo(session.user.id), userDisplayNames([session.user.id])]);
  const organization = organizations[0];
  const now = new Date();
  const todayKey = localDateKey(now);
  const todayLabel = formatDateKey(todayKey, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const firstName = (displayNames.get(session.user.id) ?? session.user.name ?? "").trim().split(/\s+/)[0];
  const greeting = greetingFor(hourInAppZone(now), firstName);

  if (!organization) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={greeting} description={todayLabel} />
        <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet. Ask an administrator to add you to one." backHref="/account/security" backLabel="Your account" />
      </div>
    );
  }

  const organizationId = organization._id.toString();
  const can = async (permission: string) => hasPermission(permission, organizationId);
  const [
    canReadEmployees,
    canReadLeave,
    canDecideLeave,
    canReadAttendance,
    canReadEvents,
    canReadTravel,
    canReadCases,
    canReadPayroll,
    canUpdatePayroll,
    canApprovePayroll,
    canReleasePayroll,
    canReadCompensation,
    canReadClearance,
    canReadSettlements,
    canReadDocuments,
    canReadAudit,
  ] = await Promise.all(
    [
      "employees.read",
      "leave.read",
      "leave.approve",
      "attendance.read",
      "events.read",
      "travel-orders.read",
      "cases.read",
      "payroll-runs.read",
      "payroll-runs.update",
      "payroll.approve",
      "payroll.release",
      "compensation.read",
      "clearance.read",
      "final-settlements.read",
      "employee-documents.read",
      "audit-logs.read",
    ].map(can),
  );

  const [roster, statuses, pendingLeave, leaveTypes, leaveToday, attendanceToday, travelOrders, monthEvents, cases, payrollRuns, compensation, employmentTypes, clearances, settlements, expiringDocuments, holidays, approvedLeave, activity] = await Promise.all([
    canReadEmployees ? EmployeeService.listWithCurrentStatus(organizationId) : null,
    canReadEmployees ? EmploymentStatusService.listCurrent(organizationId) : null,
    canReadLeave && canDecideLeave ? LeaveRequestService.listForOrganization(organizationId, { status: "pending" }) : null,
    canReadLeave ? LeaveTypeService.listCurrent(organizationId) : null,
    canReadLeave ? LeaveRequestService.listCoveringDate(organizationId, todayKey) : null,
    canReadAttendance ? AttendanceService.listForOrganization(organizationId, { date: now }) : null,
    canReadTravel ? TravelOrderService.listCurrent(organizationId) : null,
    canReadEvents
      ? Promise.all([EventService.listForMonth(organizationId, todayKey.slice(0, 7)), EventService.listForMonth(organizationId, nextMonthKey(todayKey))]).then(([a, b]) => [...a, ...b])
      : null,
    canReadCases ? Promise.all([CaseService.listCurrent(organizationId), CaseStatusService.listCurrent(organizationId)]) : null,
    canReadPayroll ? PayrollRunService.list(organizationId) : null,
    canReadCompensation ? CompensationService.listForOrganization(organizationId, todayKey) : null,
    canReadEmployees ? EmploymentTypeService.listCurrent(organizationId) : null,
    canReadClearance ? ClearanceService.listForOrganization(organizationId) : null,
    canReadSettlements ? FinalSettlementService.listForOrganization(organizationId) : null,
    canReadDocuments ? EmployeeDocumentService.listExpiringForOrganization(organizationId, new Date(`${addDays(todayKey, RISK_WINDOW_DAYS)}T23:59:59Z`)) : null,
    canReadAttendance || canReadEvents ? HolidayService.listBetween(organizationId, todayKey, addDays(todayKey, COMING_UP_DAYS)) : null,
    canReadLeave ? LeaveRequestService.listForOrganization(organizationId, { status: "approved" }) : null,
    canReadAudit ? AuditQueryService.list(organizationId, { pageSize: 30 }).then((result) => result.rows.filter((row) => !row.action.startsWith("auth.")).slice(0, 6)) : null,
  ]);

  // Names and who counts as current staff (statuses flagged as active headcount; everyone until the catalog is set up).
  const nameById = new Map((roster ?? []).map((row) => [row._id.toString(), row.person ? formatPersonName(row.person) : (row.employeeNumber ?? "Employee")]));
  const nameOf = (id: { toString(): string }) => nameById.get(id.toString()) ?? "An employee";
  const activeCodes = new Set((statuses ?? []).filter((status) => status.metadata?.isActiveHeadcount).map((status) => status.code));
  const staff = (roster ?? []).filter((row) => activeCodes.size === 0 || activeCodes.has(row.currentEmployment?.status ?? ""));
  const leaveTypeName = new Map((leaveTypes ?? []).map((type) => [type._id.toString(), type.name]));

  // ── Needs your action ────────────────────────────────────────────────
  const actions: ActionItem[] = [];

  for (const run of payrollRuns ?? []) {
    const payKey = dateToDateKey(new Date(run.payDate));
    const id = run._id.toString();
    const employees = run.totals?.employees ? ` · ${run.totals.employees} employees` : "";
    if (run.status === "approved" && canReleasePayroll) {
      actions.push({ id: `run-${id}`, kind: "payroll", title: `Release ${run.runNumber}`, detail: `Pay date ${shortDate(payKey)}${employees}`, href: `/payroll/${id}`, actionLabel: "Release", urgency: urgencyFor(todayKey, payKey, 2, 7), dueKey: payKey });
    } else if (run.status === "submitted" && canApprovePayroll) {
      actions.push({ id: `run-${id}`, kind: "payroll", title: `Approve ${run.runNumber}`, detail: `Pay date ${shortDate(payKey)}${employees}`, href: `/payroll/${id}`, actionLabel: "Review", urgency: urgencyFor(todayKey, payKey, 3, 7), dueKey: payKey });
    } else if (run.status === "draft" && canUpdatePayroll) {
      actions.push({ id: `run-${id}`, kind: "payroll", title: `Finish and submit ${run.runNumber}`, detail: `Pay date ${shortDate(payKey)}${employees}`, href: `/payroll/${id}`, actionLabel: "Open", urgency: urgencyFor(todayKey, payKey, 4, 10), dueKey: payKey });
    }
  }

  const leaveRows: ActionItem[] = (pendingLeave ?? []).map((request) => {
    const start = dateToDateKey(new Date(request.startDate));
    const end = dateToDateKey(new Date(request.endDate));
    const days = request.totalDays ? ` · ${request.totalDays} day${request.totalDays === 1 ? "" : "s"}` : "";
    return {
      id: `leave-${request._id.toString()}`,
      kind: "leave",
      title: `Decide leave for ${nameOf(request.employeeId)}`,
      detail: `${leaveTypeName.get(request.leaveTypeId.toString()) ?? "Leave"} · ${dateRange(start, end)}${days}`,
      href: "/leave?status=pending",
      actionLabel: "Decide",
      urgency: urgencyFor(todayKey, start, 2, 7),
      dueKey: start,
    };
  });
  actions.push(
    ...collapseKind(leaveRows, ROWS_PER_KIND, (count) => ({
      id: "leave-many",
      kind: "leave",
      title: `Decide ${count} leave requests`,
      detail: `The earliest starts ${relativeDue(todayKey, leaveRows.map((row) => row.dueKey!).sort()[0])}`,
      href: "/leave?status=pending",
      actionLabel: "Decide",
      urgency: rankActions(leaveRows)[0].urgency,
      dueKey: leaveRows.map((row) => row.dueKey!).sort()[0],
    })),
  );

  const contractRows: ActionItem[] = staff.flatMap((row) => {
    if (!row.currentEmployment?.endOfContract) return [];
    const endKey = dateToDateKey(new Date(row.currentEmployment.endOfContract));
    const days = Math.round((Date.parse(`${endKey}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86_400_000);
    if (days < -1 || days > CONTRACT_WINDOW_DAYS) return [];
    return [
      {
        id: `contract-${row._id.toString()}`,
        kind: "contract",
        title: `Renew or end ${nameOf(row._id)}'s contract`,
        detail: `Ends ${shortDate(endKey)} (${relativeDue(todayKey, endKey)})`,
        href: `/people/${row._id.toString()}`,
        actionLabel: "Open profile",
        urgency: urgencyFor(todayKey, endKey, 7, 14),
        dueKey: endKey,
      },
    ];
  });
  actions.push(...collapseKind(contractRows, ROWS_PER_KIND, (count) => ({ id: "contract-many", kind: "contract", title: `Review ${count} contracts ending soon`, detail: `Within the next ${CONTRACT_WINDOW_DAYS} days`, href: "/people", actionLabel: "Open people", urgency: rankActions(contractRows)[0].urgency, dueKey: rankActions(contractRows)[0].dueKey })));

  if (compensation && roster) {
    const withPay = new Set(compensation.filter((entry) => entry.current).map((entry) => entry.employeeId));
    const missing = staff.filter((row) => !withPay.has(row._id.toString()));
    const rows: ActionItem[] = missing.map((row) => ({ id: `pay-${row._id.toString()}`, kind: "pay", title: `Set pay terms for ${nameOf(row._id)}`, detail: "Left out of payroll until a rate is set", href: "/payroll/compensation", actionLabel: "Set pay", urgency: "soon" }));
    actions.push(...collapseKind(rows, 3, (count) => ({ id: "pay-many", kind: "pay", title: `Set pay terms for ${count} employees`, detail: "They're left out of payroll until a rate is set", href: "/payroll/compensation", actionLabel: "Set pay", urgency: "soon" })));
  }

  const ranked = rankActions(actions);

  // ── Legal & compliance risk ─────────────────────────────────────────
  const risks: ActionItem[] = [];
  if (roster && employmentTypes) {
    const months = new Map(employmentTypes.flatMap((type) => {
      const value = catalogNumber(type, "regularizeAfterMonths", LEGACY_REGULARIZATION_MONTHS);
      return value ? [[type.code, value] as const] : [];
    }));
    const rows = regularizationRisks(
      staff.map((row) => ({ id: row._id.toString(), name: nameOf(row._id), employmentType: row.currentEmployment?.employmentType, hiredKey: row.currentEmployment?.effectiveFrom ? dateToDateKey(new Date(row.currentEmployment.effectiveFrom)) : null })),
      months,
      todayKey,
    );
    risks.push(...collapseKind(rows, ROWS_PER_KIND, (count) => ({ id: "regularize-many", kind: "regularization", title: `Evaluate ${count} probationary employees`, detail: "Each becomes regular by law at the end of probation unless evaluated", href: "/people", actionLabel: "Open people", urgency: rankActions(rows)[0].urgency, dueKey: rankActions(rows)[0].dueKey })));
  }
  if (clearances) {
    const settlementByClearance = new Map((settlements ?? []).map((settlement) => [settlement.clearanceCaseId.toString(), settlement]));
    const finalPayDays = (organization as { compliance?: { finalPayDays?: number } }).compliance?.finalPayDays ?? DEFAULT_FINAL_PAY_DAYS;
    const rows = finalPayRisks(
      clearances
        .filter((clearance) => clearance.status !== "cancelled" && clearance.status !== "closed")
        .map((clearance) => {
          const settlement = settlementByClearance.get(clearance._id.toString());
          return {
            clearanceId: clearance._id.toString(),
            employeeName: clearance.employeeName,
            lastWorkingDayKey: dateToDateKey(new Date(clearance.lastWorkingDay)),
            settlementId: canReadSettlements && settlement ? settlement._id.toString() : undefined,
            settlementStatus: settlement?.status ?? null,
          };
        }),
      finalPayDays,
      todayKey,
    );
    risks.push(...rows);
  }
  if (expiringDocuments) {
    const rows = documentRisks(
      expiringDocuments.map((document) => ({ id: document._id.toString(), employeeId: document.employeeId.toString(), employeeName: nameOf(document.employeeId), title: document.title, expiresKey: dateToDateKey(new Date(document.expiresAt!)) })),
      todayKey,
    );
    risks.push(...collapseKind(rows, ROWS_PER_KIND, (count) => ({ id: "documents-many", kind: "document", title: `${count} employee documents expired or expiring`, detail: `Within the next ${RISK_WINDOW_DAYS} days or already past`, href: "/people", actionLabel: "Open people", urgency: rankActions(rows)[0].urgency, dueKey: rankActions(rows)[0].dueKey })));
  }
  if (roster) {
    const missingIds = staff.filter((row) => !row.person?.sssNumber || !row.person?.philHealthNumber || !row.person?.pagIbigNumber || !row.person?.tinNumber);
    const rows: ActionItem[] = missingIds.map((row) => ({ id: `ids-${row._id.toString()}`, kind: "ids", title: `Complete ${nameOf(row._id)}'s government IDs`, detail: "Missing SSS, PhilHealth, Pag-IBIG or TIN", href: `/people/${row._id.toString()}`, actionLabel: "Open profile", urgency: "later" }));
    risks.push(...collapseKind(rows, 3, (count) => ({ id: "ids-many", kind: "ids", title: `Complete government IDs for ${count} employees`, detail: "Missing SSS, PhilHealth, Pag-IBIG or TIN", href: "/people", actionLabel: "Open people", urgency: "later" })));
  }

  if (cases) {
    const open = cases[0].filter((item) => isOpenCase(item.status, closedCaseCodes(cases[1])));
    const rows: ActionItem[] = open.map((item) => ({ id: `case-${item._id.toString()}`, kind: "case", title: `Follow up ${item.caseNumber}`, detail: item.caseName, href: "/cases", actionLabel: "Open", urgency: "later" }));
    risks.push(...collapseKind(rows, 3, (count) => ({ id: "case-many", kind: "case", title: `Follow up ${count} open cases`, detail: "Not yet closed or dismissed", href: "/cases", actionLabel: "Open cases", urgency: "later" })));
  }

  const rankedRisks = rankActions(risks);

  // ── Who's out today ─────────────────────────────────────────────────
  const onLeaveIds = new Set((leaveToday ?? []).map((request) => request.employeeId.toString()));
  const travellingIds = new Set(
    (travelOrders ?? []).filter((order) => order.status !== "cancelled" && covers(order.startDate, order.endDate, todayKey)).flatMap((order) => order.employeeIds.map((id: { toString(): string }) => id.toString())),
  );
  const clockedIn = new Set((attendanceToday ?? []).map((record) => record.employeeId.toString()));
  // Someone past their last working day (separation in progress) isn't expected at work.
  const separatedIds = new Set(
    (clearances ?? []).filter((clearance) => clearance.status !== "cancelled" && dateToDateKey(new Date(clearance.lastWorkingDay)) < todayKey).map((clearance) => clearance.employeeId.toString()),
  );
  const noTimeIn =
    attendanceToday && roster
      ? staff.filter((row) => !clockedIn.has(row._id.toString()) && !onLeaveIds.has(row._id.toString()) && !travellingIds.has(row._id.toString()) && !separatedIds.has(row._id.toString()))
      : null;

  // ── Upcoming: everything date-based in the next 30 days ─────────────
  const horizonKey = addDays(todayKey, COMING_UP_DAYS);
  const within = (key: string) => key >= todayKey && key <= horizonKey;
  const upcoming: UpcomingEntry[] = [];
  for (const event of monthEvents ? upcomingEvents(monthEvents, todayKey, 50) : []) {
    const key = dateToDateKey(new Date(event.date));
    if (within(key)) upcoming.push({ key, kind: "event", title: event.title, detail: event.time ?? "Company event", href: "/events" });
  }
  for (const holiday of holidays ?? []) upcoming.push({ key: holiday.date, kind: "holiday", title: holiday.name, detail: HOLIDAY_TYPE_LABELS[holiday.type], href: "/attendance/schedules" });
  for (const run of payrollRuns ?? []) {
    if (run.status === "cancelled" || run.status === "released") continue;
    const key = dateToDateKey(new Date(run.payDate));
    if (within(key)) upcoming.push({ key, kind: "payday", title: `Pay date · ${run.runNumber}`, detail: `Run is ${run.status}`, href: `/payroll/${run._id.toString()}` });
  }
  for (const request of approvedLeave ?? []) {
    const key = dateToDateKey(new Date(request.startDate));
    if (key > todayKey && key <= horizonKey) {
      const end = dateToDateKey(new Date(request.endDate));
      upcoming.push({ key, kind: "leave", title: `${nameOf(request.employeeId)} on leave`, detail: `${leaveTypeName.get(request.leaveTypeId.toString()) ?? "Leave"} · ${dateRange(key, end)}`, href: `/people/${request.employeeId.toString()}?tab=leave` });
    }
  }
  for (const row of staff) {
    const id = row._id.toString();
    if (row.currentEmployment?.endOfContract) {
      const key = dateToDateKey(new Date(row.currentEmployment.endOfContract));
      if (within(key)) upcoming.push({ key, kind: "contract", title: `${nameOf(row._id)}'s contract ends`, detail: row.currentEmployment.employmentType ? `${row.currentEmployment.employmentType.charAt(0).toUpperCase()}${row.currentEmployment.employmentType.slice(1)} contract` : "End of contract", href: `/people/${id}` });
    }
    if (row.person?.birthDate) {
      const birth = new Date(row.person.birthDate);
      const year = Number(todayKey.slice(0, 4));
      const md = `${String(birth.getUTCMonth() + 1).padStart(2, "0")}-${String(birth.getUTCDate()).padStart(2, "0")}`;
      const key = `${year}-${md}` >= todayKey ? `${year}-${md}` : `${year + 1}-${md}`;
      if (within(key)) upcoming.push({ key, kind: "birthday", title: `${nameOf(row._id)}'s birthday`, detail: `Turns ${calculateAge(birth) + (key === todayKey ? 0 : 1)}`, href: `/people/${id}` });
    }
  }
  // Probation ends and document expiries already sit in the risk list with their deadlines; the
  // timeline repeats only their dates so the month reads in one place.
  for (const risk of risks) {
    if (!risk.dueKey || !within(risk.dueKey)) continue;
    if (risk.kind === "regularization") upcoming.push({ key: risk.dueKey, kind: "probation", title: risk.title.replace(/^Evaluate (.+) before regularization$/, "$1's probation ends"), detail: "Becomes regular unless evaluated", href: risk.href });
    if (risk.kind === "document") upcoming.push({ key: risk.dueKey, kind: "document", title: risk.title.replace(/^Renew /, "").replace(/'s (.+)$/, "'s $1 expires"), detail: "Document expiry", href: risk.href });
  }
  upcoming.sort((a, b) => a.key.localeCompare(b.key) || UPCOMING_ORDER.indexOf(a.kind) - UPCOMING_ORDER.indexOf(b.kind));

  // ── Today at work: late and absent, by name ─────────────────────────
  const lateToday = (attendanceToday ?? []).filter((record) => record.status === "late");
  const absentToday = (attendanceToday ?? []).filter((record) => record.status === "absent");

  // ── Payroll in progress: stage and who acts next ────────────────────
  const NEXT_STEP: Record<string, string> = { draft: "HR finishes and submits", submitted: "Waiting for an approver", approved: "Ready to release" };
  const runsInProgress = (payrollRuns ?? [])
    .filter((run) => run.status in NEXT_STEP)
    .sort((a, b) => new Date(a.payDate).getTime() - new Date(b.payDate).getTime())
    .slice(0, 4);

  // ── Joining and leaving ─────────────────────────────────────────────
  const joining = staff
    .flatMap((row) => {
      if (!row.currentEmployment?.effectiveFrom) return [];
      const key = dateToDateKey(new Date(row.currentEmployment.effectiveFrom));
      return key >= addDays(todayKey, -14) && key <= addDays(todayKey, 30) ? [{ id: row._id.toString(), name: nameOf(row._id), key }] : [];
    })
    .sort((a, b) => a.key.localeCompare(b.key));
  const leaving = (clearances ?? [])
    .flatMap((clearance) => {
      if (clearance.status === "cancelled" || clearance.status === "closed") return [];
      const key = dateToDateKey(new Date(clearance.lastWorkingDay));
      return key >= addDays(todayKey, -7) && key <= addDays(todayKey, 30) ? [{ id: clearance._id.toString(), employeeId: clearance.employeeId.toString(), name: clearance.employeeName, key, reason: clearance.separationTypeName }] : [];
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  return (
    <div className="flex flex-col gap-6">
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-violet-500/5 to-teal-500/10 px-5 py-5 sm:px-6">
        <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
        <h1 className="relative text-2xl font-bold tracking-tight">{greeting}</h1>
        <p className="relative mt-1 text-sm text-muted-foreground">
          {todayLabel}
        </p>
      </div>


      {/* One list of cards, most important first, flowed into two balanced columns: both columns end at about the same height. */}
      <div className="gap-4 lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid" data-testid="dashboard-cards">
          <Card data-testid="dashboard-actions" className={ACCENT.blue.card}>
            <CardHead accent="blue" icon={ListChecks} title="Needs your action" description={ranked.length ? `${ranked.length} thing${ranked.length === 1 ? "" : "s"} to do, most urgent first.` : "Nothing waiting on you."} />
            <CardContent>
              {ranked.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                  You&apos;re all caught up.
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {ranked.map((action) => (
                    <ActionRow key={action.id} action={action} todayKey={todayKey} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card data-testid="dashboard-risks" className={ACCENT.rose.card}>
            <CardHead accent="rose" icon={Scale} title="Legal & compliance risk" description={`Deadlines with legal consequences, next ${RISK_WINDOW_DAYS} days.`} />
            <CardContent>
              {rankedRisks.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                  No risks found.
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {rankedRisks.map((risk) => (
                    <ActionRow key={risk.id} action={risk} todayKey={todayKey} compact />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card data-testid="dashboard-coming-up" className={ACCENT.violet.card}>
            <CardHead accent="violet" icon={CalendarRange} title="Upcoming" description={`Next ${COMING_UP_DAYS} days: contracts, probation, pay dates, leave, holidays, events, birthdays.`} />
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing in the next {COMING_UP_DAYS} days.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {upcoming.slice(0, UPCOMING_SHOWN).map((entry, index) => {
                    const { icon: Icon, tone } = UPCOMING_STYLE[entry.kind];
                    return (
                      <li key={`${entry.key}-${entry.kind}-${index}`}>
                        <Link href={entry.href} className="group flex items-start gap-3 rounded-md text-sm">
                          <span className="w-12 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">{shortDate(entry.key)}</span>
                          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", tone)} aria-hidden="true">
                            <Icon className="size-3.5" />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate font-medium group-hover:text-primary" title={entry.title}>
                              {entry.title}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {relativeDue(todayKey, entry.key)} · {entry.detail}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
              {upcoming.length > UPCOMING_SHOWN && <p className="mt-3 text-xs text-muted-foreground">and {upcoming.length - UPCOMING_SHOWN} more later this month.</p>}
            </CardContent>
          </Card>
          {payrollRuns && (
            <Card data-testid="dashboard-payroll" className={ACCENT.emerald.card}>
              <CardHead accent="emerald" icon={Banknote} title="Payroll" description="Runs in progress, by pay date, and who acts next." />
              <CardContent>
                {runsInProgress.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payroll in progress.</p>
                ) : (
                  <ul className="flex flex-col divide-y">
                    {runsInProgress.map((run) => {
                      const payKey = dateToDateKey(new Date(run.payDate));
                      return (
                        <li key={run._id.toString()}>
                          <Link href={`/payroll/${run._id.toString()}`} className="group flex items-center gap-3 py-2.5 text-sm">
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate font-medium group-hover:text-primary">{run.runNumber}</span>
                              <span className="truncate text-xs text-muted-foreground">
                                Pays {shortDate(payKey)} ({relativeDue(todayKey, payKey)}) · {NEXT_STEP[run.status]}
                              </span>
                            </span>
                            <RunStages status={run.status} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
          {(leaveToday || travelOrders || noTimeIn) && (
            <Card data-testid="dashboard-whos-out" className={ACCENT.teal.card}>
              <CardHead accent="teal" icon={UsersRound} title="Who's out today" description={shortDate(todayKey)} />
              <CardContent className="flex flex-col gap-4">
                {leaveToday && <NameGroup icon={Palmtree} tone="emerald" label="On leave" ids={[...onLeaveIds]} nameOf={nameOf} moreHref="/leave" />}
                {travelOrders && <NameGroup icon={Plane} tone="sky" label="Travelling" ids={[...travellingIds]} nameOf={nameOf} moreHref="/travel-orders" />}
                {attendanceToday && (
                  <NameGroup
                    icon={AlarmClock}
                    tone="orange"
                    label="Late"
                    ids={lateToday.map((record) => record.employeeId.toString())}
                    nameOf={(id) => {
                      const record = lateToday.find((item) => item.employeeId.toString() === id);
                      return `${nameOf(id)}${record?.checkInAt ? ` · ${formatTime(record.checkInAt)}` : ""}`;
                    }}
                    moreHref="/attendance"
                  />
                )}
                {attendanceToday && <NameGroup icon={UserX} tone="red" label="Absent" ids={absentToday.map((record) => record.employeeId.toString())} nameOf={nameOf} moreHref="/attendance" />}
                {noTimeIn && <NameGroup icon={Clock} tone="amber" label="No time-in yet" ids={noTimeIn.map((row) => row._id.toString())} nameOf={nameOf} moreHref="/attendance" />}
              </CardContent>
            </Card>
          )}
          {(roster || clearances) && (
            <Card data-testid="dashboard-joining-leaving" className={ACCENT.indigo.card}>
              <CardHead accent="indigo" icon={UsersRound} title="Joining & leaving" description="New hires in the last 2 weeks or starting soon, and last working days coming up." />
              <CardContent className="flex flex-col gap-4">
                <PeopleDates icon={UserPlus} tone="emerald" label="Joining" empty="No new hires around now." entries={joining.map((entry) => ({ key: entry.key, name: entry.name, href: `/people/${entry.id}`, note: entry.key <= todayKey ? `joined ${formatRelativeDays(new Date(`${entry.key}T00:00:00Z`), new Date(`${todayKey}T00:00:00Z`))}` : `starts ${relativeDue(todayKey, entry.key)}` }))} />
                {clearances && <PeopleDates icon={LogOut} tone="red" label="Leaving" empty="No one is leaving soon." entries={leaving.map((entry) => ({ key: entry.key, name: entry.name, href: `/clearance/${entry.id}`, note: `${entry.reason} · last day ${relativeDue(todayKey, entry.key)}` }))} />}
              </CardContent>
            </Card>
          )}

          {activity && (
            <Card data-testid="dashboard-activity" className={ACCENT.slate.card}>
              <CardHead accent="slate" icon={History} title="Recent activity" description="The latest changes across the organization." />
              <CardContent>
                {activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {activity.map((entry) => (
                      <li key={entry.id} className="flex items-start gap-2.5 text-sm">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{entry.actorName}</span> <span className="text-muted-foreground">{describeAuditAction(entry.action).toLowerCase()}</span>
                          <span className="block text-xs text-muted-foreground">{formatRelativeDays(entry.timestamp, now)} · {formatTime(entry.timestamp)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/settings/audit" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  Audit log
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </CardContent>
            </Card>
          )}
      </div>
    </div>
  );
}

type Accent = "blue" | "rose" | "violet" | "teal" | "emerald" | "indigo" | "slate";
// Each card's own color: a top edge and a tinted icon tile, light and dark.
const ACCENT: Record<Accent, { card: string; tile: string }> = {
  blue: { card: "border-t-4 border-t-blue-500", tile: "bg-blue-500/12 text-blue-600 dark:text-blue-400" },
  rose: { card: "border-t-4 border-t-rose-500", tile: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  violet: { card: "border-t-4 border-t-violet-500", tile: "bg-violet-500/12 text-violet-600 dark:text-violet-400" },
  teal: { card: "border-t-4 border-t-teal-500", tile: "bg-teal-500/12 text-teal-600 dark:text-teal-400" },
  emerald: { card: "border-t-4 border-t-emerald-500", tile: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  indigo: { card: "border-t-4 border-t-indigo-500", tile: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400" },
  slate: { card: "border-t-4 border-t-slate-400", tile: "bg-slate-500/12 text-slate-600 dark:text-slate-300" },
};
const CHIP = {
  emerald: { tile: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400", chip: "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300" },
  sky: { tile: "bg-sky-500/12 text-sky-600 dark:text-sky-400", chip: "bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300" },
  amber: { tile: "bg-amber-500/12 text-amber-600 dark:text-amber-400", chip: "bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-300" },
  orange: { tile: "bg-orange-500/12 text-orange-600 dark:text-orange-400", chip: "bg-orange-500/10 text-orange-800 hover:bg-orange-500/20 dark:text-orange-300" },
  red: { tile: "bg-red-500/12 text-red-600 dark:text-red-400", chip: "bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-300" },
} as const;

function CardHead({ accent, icon: Icon, title, description }: { accent: Accent; icon: LucideIcon; title: string; description: React.ReactNode }) {
  return (
    <CardHeader>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", ACCENT[accent].tile)} aria-hidden="true">
          <Icon className="size-4.5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </div>
    </CardHeader>
  );
}

const RUN_STAGES = ["draft", "submitted", "approved", "released"] as const;

/** Draft → Submitted → Approved → Released, with the run's stage lit. */
function RunStages({ status }: { status: string }) {
  const current = RUN_STAGES.indexOf(status as (typeof RUN_STAGES)[number]);
  return (
    <span className="flex shrink-0 items-center gap-1" aria-label={`Stage: ${status}`}>
      {RUN_STAGES.map((stage, index) => (
        <span
          key={stage}
          title={stage}
          className={cn("h-1.5 w-5 rounded-full", index < current ? "bg-emerald-500" : index === current ? "bg-emerald-500 ring-2 ring-emerald-500/30" : "bg-muted")}
        />
      ))}
    </span>
  );
}

function PeopleDates({
  icon: Icon,
  tone,
  label,
  empty,
  entries,
}: {
  icon: LucideIcon;
  tone: keyof typeof CHIP;
  label: string;
  empty: string;
  entries: { key: string; name: string; href: string; note: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <span className={cn("flex size-6 items-center justify-center rounded-md", CHIP[tone].tile)} aria-hidden="true">
          <Icon className="size-3.5" />
        </span>
        {label}
      </p>
      {entries.length === 0 ? (
        <p className="pl-8 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 pl-8">
          {entries.slice(0, 6).map((entry) => (
            <li key={entry.href}>
              <Link href={entry.href} className="group flex items-baseline gap-2 text-sm">
                <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">{formatDateKey(entry.key, { month: "short", day: "numeric" })}</span>
                <span className="min-w-0 truncate font-medium group-hover:text-primary">{entry.name}</span>
                <span className="min-w-0 truncate text-xs text-muted-foreground">{entry.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type UpcomingKind = "contract" | "probation" | "payday" | "leave" | "holiday" | "document" | "event" | "birthday";
type UpcomingEntry = { key: string; kind: UpcomingKind; title: string; detail: string; href: string };
/** Same-day order: obligations first, then people's plans, then the calendar. */
const UPCOMING_ORDER: UpcomingKind[] = ["contract", "probation", "payday", "document", "leave", "holiday", "event", "birthday"];
const UPCOMING_STYLE: Record<UpcomingKind, { icon: LucideIcon; tone: string }> = {
  contract: { icon: FileClock, tone: "bg-amber-500/12 text-amber-600 dark:text-amber-400" },
  probation: { icon: UserCheck, tone: "bg-orange-500/12 text-orange-600 dark:text-orange-400" },
  payday: { icon: Banknote, tone: "bg-blue-500/12 text-blue-600 dark:text-blue-400" },
  document: { icon: FileText, tone: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  leave: { icon: Palmtree, tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  holiday: { icon: Flag, tone: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  event: { icon: CalendarDays, tone: "bg-violet-500/12 text-violet-600 dark:text-violet-400" },
  birthday: { icon: Cake, tone: "bg-pink-500/12 text-pink-600 dark:text-pink-400" },
};

// A dot, not a word: "LATER" next to a legal deadline read like "ignore this".
const URGENCY_DOT: Record<ActionUrgency, { dot: string; label: string }> = {
  now: { dot: "bg-destructive", label: "Urgent" },
  soon: { dot: "bg-warning", label: "Coming up" },
  later: { dot: "bg-muted-foreground/40", label: "When you can" },
};

function ActionRow({ action, todayKey, compact = false }: { action: ActionItem; todayKey: string; compact?: boolean }) {
  const { dot, label } = URGENCY_DOT[action.urgency];
  const when = action.dueKey ? (action.dueKey < todayKey ? `overdue, ${relativeDue(todayKey, action.dueKey)}` : `due ${relativeDue(todayKey, action.dueKey)}`) : null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3 first:pt-0 last:pb-0" data-testid="dashboard-action" data-urgency={action.urgency}>
      <span className={cn("size-2 shrink-0 rounded-full", dot)} aria-hidden="true" />
      <span className="flex min-w-0 flex-1 basis-56 flex-col">
        <span className="truncate text-sm font-medium" title={action.title}>
          <span className="sr-only">{label}: </span>
          {action.title}
        </span>
        <span className="truncate text-xs text-muted-foreground" title={action.detail}>
          {when && !compact && action.kind !== "contract" && (
            <span className={cn("font-medium", action.urgency === "now" ? "text-destructive" : action.urgency === "soon" ? "text-warning" : "")}>{when} · </span>
          )}
          {action.detail}
        </span>
      </span>
      <Link href={action.href} className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
        {action.actionLabel}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

function NameGroup({
  icon: Icon,
  tone,
  label,
  ids,
  nameOf,
  moreHref,
}: {
  icon: typeof Palmtree;
  tone: keyof typeof CHIP;
  label: string;
  ids: string[];
  nameOf: (id: string) => string;
  moreHref: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-2 text-sm font-medium">
        <span className={cn("flex size-6 items-center justify-center rounded-md", CHIP[tone].tile)} aria-hidden="true">
          <Icon className="size-3.5" />
        </span>
        {label}
        <span className="text-muted-foreground">({ids.length})</span>
      </p>
      {ids.length === 0 ? (
        <p className="pl-8 text-xs text-muted-foreground">No one.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5 pl-8">
          {ids.slice(0, NAMES_SHOWN).map((id) => (
            <li key={id}>
              <Link href={`/people/${id}`} className={cn("inline-block max-w-40 truncate rounded-md px-2 py-0.5 text-xs font-medium transition-colors", CHIP[tone].chip)} title={nameOf(id)}>
                {nameOf(id)}
              </Link>
            </li>
          ))}
          {ids.length > NAMES_SHOWN && (
            <li>
              <Link href={moreHref} className="inline-block rounded-md px-2 py-0.5 text-xs font-medium text-primary hover:underline">
                +{ids.length - NAMES_SHOWN} more
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
