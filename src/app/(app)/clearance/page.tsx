import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, BadgeCheck, CalendarClock, ClipboardList } from "lucide-react";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { ClearanceService } from "@/domains/clearance/clearance-service";
import { ClearanceChecklistService } from "@/domains/clearance/clearance-checklist-service";
import { caseProgress, summarizeClearances } from "@/domains/clearance/clearance-summary";
import { ClearanceDepartmentService } from "@/domains/catalog/clearance-department-service";
import { SeparationTypeService } from "@/domains/catalog/separation-type-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { loadCurrentStaffCheck } from "@/domains/attendance/current-staff";
import { formatPersonName } from "@/lib/person-name";
import { localDateKey } from "@/lib/date-key";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusFilterTabs } from "@/components/shared/status-filter-tabs";
import { cn } from "@/lib/utils";
import { OpenClearanceDialog } from "./open-clearance-dialog";
import { ChecklistDialog } from "./checklist-dialog";
import { CLEARANCE_STATUS_LABELS, CLEARANCE_STATUS_TONES } from "./clearance-labels";
import { NoAccessState } from "@/components/shared/no-access-state";

export const metadata: Metadata = { title: "Clearance" };

type SearchParams = Record<string, string | string[] | undefined>;
const SHORT = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" } as const;

export default async function ClearancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <NoAccessState needed="A role in an organization" message="Your account isn't part of an organization yet." />;
  const organizationId = organization._id.toString();
  if (!(await hasPermission("clearance.read", organizationId))) {
    return <NoAccessState permission="clearance.read" message="You don't have access to view clearances." />;
  }

  const [canCreate, canManage, cases, separationTypes, departments, checklist, roster, isCurrentStaff] = await Promise.all([
    hasPermission("clearance.create", organizationId),
    hasPermission("clearance.update", organizationId),
    ClearanceService.listForOrganization(organizationId),
    SeparationTypeService.listCurrent(organizationId),
    ClearanceDepartmentService.listCurrent(organizationId),
    ClearanceChecklistService.listCurrent(organizationId),
    EmployeeService.listWithCurrentStatus(organizationId),
    loadCurrentStaffCheck(organizationId),
  ]);

  const now = new Date();
  const summary = summarizeClearances(cases, now);
  const activeEmployeeIds = new Set(cases.filter((clearance) => clearance.active).map((clearance) => clearance.employeeId.toString()));
  const employeeOptions = roster
    .filter((row) => row.person && isCurrentStaff(row.currentEmployment?.status) && !activeEmployeeIds.has(row._id.toString()))
    .map((row) => ({ id: row._id.toString(), label: `${formatPersonName(row.person)}${row.employeeNumber ? ` (${row.employeeNumber})` : ""}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const typeOptions = separationTypes.filter((type) => type.status === "active").map((type) => ({ id: type.code, label: type.name }));
  const departmentOptions = departments.filter((department) => department.status === "active").map((department) => ({ id: department.code, label: department.name }));

  const counts = new Map<string, number>();
  for (const clearance of cases) counts.set(clearance.status, (counts.get(clearance.status) ?? 0) + 1);
  const tabs = [
    { value: "active", label: "Active", count: cases.filter((clearance) => clearance.active).length },
    ...["in_clearance", "cleared", "cancelled", "closed"].filter((status) => counts.has(status)).map((status) => ({ value: status, label: CLEARANCE_STATUS_LABELS[status], count: counts.get(status)! })),
    { value: "any", label: "All", count: cases.length },
  ];
  const requested = typeof params.status === "string" ? params.status : "active";
  const view = tabs.some((tab) => tab.value === requested) ? requested : "active";
  const rows = cases.filter((clearance) => (view === "any" ? true : view === "active" ? clearance.active : clearance.status === view));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clearance"
        description="Offboarding sign-off across departments. Final pay can go to approval once every blocking item is resolved."
        action={
          <div className="flex items-center gap-2">
            {canManage && <ChecklistDialog organizationId={organizationId} departments={departmentOptions} items={checklist.map((item) => ({ id: item._id.toString(), departmentCode: item.departmentCode, title: item.title, blocking: item.blocking, dueDaysAfterLastDay: item.dueDaysAfterLastDay, status: item.status, autoSource: item.autoSource ?? null }))} />}
            {canCreate && <OpenClearanceDialog organizationId={organizationId} employees={employeeOptions} separationTypes={typeOptions} todayKey={localDateKey()} />}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="In clearance" value={summary.inClearance} hint="Waiting on at least one blocking item" icon={ClipboardList} emphasis />
        <MetricCard
          label="Overdue items"
          value={summary.overdueItems}
          hint={summary.overdueItems ? "Past their due date, still pending" : "Every item is on time"}
          icon={AlarmClock}
          tone={summary.overdueItems ? "danger" : "success"}
        />
        <MetricCard label="Last day this week" value={summary.lastDayThisWeek} hint="Leaving within 7 days" icon={CalendarClock} tone={summary.lastDayThisWeek ? "warning" : "default"} />
        <MetricCard label="Ready for final pay" value={summary.readyForFinalPay} hint="All blocking items resolved" icon={BadgeCheck} tone={summary.readyForFinalPay ? "success" : "default"} />
      </div>

      <StatusFilterTabs options={tabs} active={view} params={params} basePath="/clearance" />

      <DataTable
        caption="Clearances"
        columns={[
          {
            key: "employee",
            header: "Employee",
            render: (clearance) => (
              <Link href={`/clearance/${clearance._id.toString()}`} className="flex flex-col">
                <span className="font-medium hover:text-primary">{clearance.employeeName}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {clearance.caseNumber}
                  {clearance.employeeNumber ? ` · ${clearance.employeeNumber}` : ""}
                </span>
              </Link>
            ),
          },
          { key: "type", header: "Separation", render: (clearance) => clearance.separationTypeName },
          {
            key: "lastDay",
            header: "Last day",
            render: (clearance) => <span className="tabular-nums">{new Date(clearance.lastWorkingDay).toLocaleDateString("en-US", SHORT)}</span>,
          },
          {
            key: "progress",
            header: "Progress",
            render: (clearance) => {
              const progress = caseProgress(clearance.items, now);
              const percent = progress.total ? Math.round((progress.resolved / progress.total) * 100) : 100;
              return (
                <div className="flex min-w-44 flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="tabular-nums">
                      {progress.resolved} of {progress.total} items
                    </span>
                    {progress.overdue > 0 && <span className="font-medium text-destructive tabular-nums">{progress.overdue} overdue</span>}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${clearance.employeeName} clearance progress`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                    <div className={cn("h-full rounded-full", progress.overdue ? "bg-destructive" : "bg-primary")} style={{ width: `${percent}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {progress.departments.map((department) => (
                      <span
                        key={department.code}
                        title={`${department.name}: ${department.resolved} of ${department.total}`}
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          department.resolved === department.total ? "bg-success/12 text-success" : department.overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {department.name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            },
          },
          {
            key: "status",
            header: "Status",
            render: (clearance) => (
              <StatusBadge status={clearance.status} label={CLEARANCE_STATUS_LABELS[clearance.status]} tone={CLEARANCE_STATUS_TONES[clearance.status]} />
            ),
          },
        ]}
        rows={rows}
        getRowKey={(clearance) => clearance._id.toString()}
        emptyMessage={view === "active" ? "No one is going through clearance right now." : "No clearances in this view."}
        emptyDescription={canCreate ? "Open a clearance when a separation notice comes in." : undefined}
      />
    </div>
  );
}
