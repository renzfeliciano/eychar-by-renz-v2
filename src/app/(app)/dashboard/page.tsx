import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { Banknote, CalendarCheck2, Palmtree, UserCheck } from "lucide-react";
import { authOptions } from "@/server/auth/options";
import { OrganizationService } from "@/domains/organization/organization-service";
import { hasPermission } from "@/app/_shared/has-permission";
import { userDisplayNames } from "@/domains/identity/user-directory";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { ProjectService } from "@/domains/organization/project-service";
import { LeaveRequestService } from "@/domains/leave/leave-request-service";
import { AttendanceService } from "@/domains/attendance/attendance-service";
import { EventService } from "@/domains/events/event-service";
import { EventCategoryService } from "@/domains/catalog/event-category-service";
import { TravelOrderService } from "@/domains/travel-orders/travel-order-service";
import { CaseService } from "@/domains/cases/case-service";
import { isOpenCase } from "@/domains/cases/case-summary";
import { PayrollRunService } from "@/domains/payroll/payroll-run-service";
import { CompensationService } from "@/domains/payroll/compensation-service";
import { PAYROLL_RUN_STATUS_LABELS } from "@/domains/payroll/payroll-labels";
import { buildAttentionItems, greetingFor, upcomingEvents, type AttendanceCounts, type AttentionCounts } from "@/domains/dashboard/dashboard-summary";
import { dateToDateKey, formatDateKey, localDateKey } from "@/lib/date-key";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { calculateAge } from "@/lib/employee-dates";
import { formatPersonName } from "@/lib/person-name";
import { HorizontalBarChart } from "@/components/shared/horizontal-bar-chart";
import { ColumnBarChart } from "./column-bar-chart";
import { DonutChart } from "./donut-chart";
import { HiringTrendChart } from "./hiring-trend-chart";
import { RecentHiresList } from "./recent-hires-list";
import { BirthdayList } from "./birthday-list";
import { AttentionList } from "./attention-list";
import { TodayPanel } from "./today-panel";
import { UpcomingEventsList } from "./upcoming-events-list";
import type { ColoredBucket, HiringTrendPoint } from "./dashboard-types";

const SERIES_COLORS = ["var(--viz-series-1)", "var(--viz-series-2)", "var(--viz-series-3)", "var(--viz-series-4)", "var(--viz-series-5)"];
const ORDINAL_COLORS = ["var(--viz-ordinal-1)", "var(--viz-ordinal-2)", "var(--viz-ordinal-3)", "var(--viz-ordinal-4)"];
const AGE_BUCKETS = ["Under 30", "30–39", "40–49", "50+"];
const TENURE_BUCKETS = ["Under 1 year", "1–3 years", "3–5 years", "5+ years"];
const HIRING_TREND_MONTHS = 12;
const TOP_PROJECTS = 6;
const DAY_MS = 86_400_000;

function ageBucketLabel(age: number): string {
  if (age < 30) return AGE_BUCKETS[0];
  if (age < 40) return AGE_BUCKETS[1];
  if (age < 50) return AGE_BUCKETS[2];
  return AGE_BUCKETS[3];
}

function tenureBucketLabel(years: number): string {
  if (years < 1) return TENURE_BUCKETS[0];
  if (years < 3) return TENURE_BUCKETS[1];
  if (years < 5) return TENURE_BUCKETS[2];
  return TENURE_BUCKETS[3];
}

/** Trailing N calendar months ending this month, oldest first. */
function trailingMonths(count: number): { key: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const offset = count - 1 - i;
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
    return { key, label };
  });
}

function nextMonthKey(todayKey: string): string {
  const [year, month] = todayKey.split("-").map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

function covers(start: Date, end: Date, dateKey: string): boolean {
  return dateToDateKey(new Date(start)) <= dateKey && dateToDateKey(new Date(end)) >= dateKey;
}

async function loadWorkforceInsights(organizationId: string) {
  const [roster, employmentStatuses, projects] = await Promise.all([
    EmployeeService.listWithCurrentStatus(organizationId),
    EmploymentStatusService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
  ]);

  // Current staff: statuses flagged as active headcount (everyone, until the catalog is set up).
  const activeStatusCodes = new Set(employmentStatuses.filter((status) => status.metadata?.isActiveHeadcount).map((status) => status.code));
  const activeRows = roster.filter((row) => activeStatusCodes.size === 0 || (row.currentEmployment?.status && activeStatusCodes.has(row.currentEmployment.status)));

  const statusCounts = new Map<string, number>();
  for (const row of roster) {
    const code = row.currentEmployment?.status;
    if (code) statusCounts.set(code, (statusCounts.get(code) ?? 0) + 1);
  }
  const statusBreakdown: ColoredBucket[] = employmentStatuses
    .filter((status) => statusCounts.has(status.code))
    .map((status, index) => ({ label: status.name, count: statusCounts.get(status.code)!, color: SERIES_COLORS[index % SERIES_COLORS.length] }));

  const genderCounts = new Map<string, number>();
  for (const row of activeRows) {
    if (row.person?.gender) genderCounts.set(row.person.gender, (genderCounts.get(row.person.gender) ?? 0) + 1);
  }
  const genderBreakdown: ColoredBucket[] = ["Male", "Female"].map((label, index) => ({ label, count: genderCounts.get(label) ?? 0, color: SERIES_COLORS[index] }));

  const ageCounts = new Map<string, number>();
  const tenureCounts = new Map<string, number>();
  for (const row of activeRows) {
    if (row.person?.birthDate) {
      const label = ageBucketLabel(calculateAge(new Date(row.person.birthDate)));
      ageCounts.set(label, (ageCounts.get(label) ?? 0) + 1);
    }
    if (row.currentEmployment?.effectiveFrom) {
      const label = tenureBucketLabel(calculateAge(new Date(row.currentEmployment.effectiveFrom)));
      tenureCounts.set(label, (tenureCounts.get(label) ?? 0) + 1);
    }
  }
  const ageBreakdown: ColoredBucket[] = AGE_BUCKETS.map((label, index) => ({ label, count: ageCounts.get(label) ?? 0, color: ORDINAL_COLORS[index] }));
  const tenureBreakdown: ColoredBucket[] = TENURE_BUCKETS.map((label, index) => ({ label, count: tenureCounts.get(label) ?? 0, color: ORDINAL_COLORS[index] }));

  // Where current staff are deployed. One hue: this compares sizes across
  // projects, so the bars don't need to be told apart by color.
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const projectCounts = new Map<string, number>();
  let unassigned = 0;
  for (const row of activeRows) {
    const projectId = row.currentAssignment?.projectId?.toString();
    if (projectId && projectNameById.has(projectId)) projectCounts.set(projectId, (projectCounts.get(projectId) ?? 0) + 1);
    else unassigned += 1;
  }
  const rankedProjects = [...projectCounts.entries()].sort((a, b) => b[1] - a[1]);
  const otherCount = rankedProjects.slice(TOP_PROJECTS).reduce((sum, [, count]) => sum + count, 0);
  const projectBreakdown: ColoredBucket[] = [
    ...rankedProjects.slice(0, TOP_PROJECTS).map(([id, count]) => ({ label: projectNameById.get(id)!, count, color: "var(--viz-series-1)" })),
    ...(otherCount ? [{ label: `${rankedProjects.length - TOP_PROJECTS} other projects`, count: otherCount, color: "var(--viz-series-1)" }] : []),
    ...(unassigned ? [{ label: "No project", count: unassigned, color: "var(--viz-ink-muted)" }] : []),
  ];

  const months = trailingMonths(HIRING_TREND_MONTHS);
  const hireCountByMonth = new Map<string, number>();
  for (const row of roster) {
    if (!row.currentEmployment?.effectiveFrom) continue;
    const d = new Date(row.currentEmployment.effectiveFrom);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    hireCountByMonth.set(key, (hireCountByMonth.get(key) ?? 0) + 1);
  }
  const hiringTrend: HiringTrendPoint[] = months.map(({ key, label }) => ({ month: key, label, count: hireCountByMonth.get(key) ?? 0 }));
  const hiresInTrend = hiringTrend.reduce((sum, point) => sum + point.count, 0);

  const recentHires = roster
    .filter((row): row is typeof row & { currentEmployment: { effectiveFrom: Date } } => Boolean(row.currentEmployment?.effectiveFrom))
    .sort((a, b) => new Date(b.currentEmployment.effectiveFrom).getTime() - new Date(a.currentEmployment.effectiveFrom).getTime())
    .slice(0, 5)
    .map((row) => ({ employeeId: row._id.toString(), name: formatPersonName(row.person), dateHired: new Date(row.currentEmployment.effectiveFrom) }));

  const now = new Date();
  const birthdaysThisMonth = activeRows
    .filter((row): row is typeof row & { person: { birthDate: Date } } => Boolean(row.person?.birthDate && new Date(row.person.birthDate).getUTCMonth() === now.getMonth()))
    .sort((a, b) => new Date(a.person.birthDate).getDate() - new Date(b.person.birthDate).getDate())
    .map((row) => ({
      employeeId: row._id.toString(),
      name: formatPersonName(row.person),
      birthDate: new Date(row.person.birthDate),
      turningAge: calculateAge(new Date(row.person.birthDate)),
    }));

  // The same record checks the People screen's summary makes.
  const nowMs = now.getTime();
  const newHires90 = activeRows.filter((row) => row.currentEmployment?.effectiveFrom && nowMs - new Date(row.currentEmployment.effectiveFrom).getTime() <= 90 * DAY_MS).length;
  const contractsEnding = activeRows.filter((row) => {
    const end = row.currentEmployment?.endOfContract ? new Date(row.currentEmployment.endOfContract).getTime() : null;
    return end !== null && end >= nowMs - DAY_MS && end - nowMs <= 30 * DAY_MS;
  }).length;
  const missingGovernmentIds = activeRows.filter((row) => !row.person?.sssNumber || !row.person?.philHealthNumber || !row.person?.pagIbigNumber || !row.person?.tinNumber).length;

  return {
    activeRows,
    newHires90,
    contractsEnding,
    missingGovernmentIds,
    statusBreakdown,
    genderBreakdown,
    ageBreakdown,
    tenureBreakdown,
    projectBreakdown,
    hiringTrend,
    hiresInTrend,
    recentHires,
    birthdaysThisMonth,
  };
}

type WorkforceInsights = Awaited<ReturnType<typeof loadWorkforceInsights>>;

/** Today's attendance over current staff, counted the way the Daily roster counts it. */
function todaysAttendance(insights: WorkforceInsights, records: { employeeId: { toString(): string }; status: string }[]): AttendanceCounts & { staff: number } {
  const statusByEmployee = new Map(records.map((record) => [record.employeeId.toString(), record.status]));
  const counts = { present: 0, late: 0, absent: 0, onLeave: 0, notRecorded: 0, staff: insights.activeRows.length };
  for (const row of insights.activeRows) {
    const status = statusByEmployee.get(row._id.toString());
    if (!status) counts.notRecorded += 1;
    else if (status === "late") counts.late += 1;
    else if (status === "absent") counts.absent += 1;
    else if (status === "on_leave") counts.onLeave += 1;
    else counts.present += 1;
  }
  return counts;
}

function SectionHeading({ id, title, description, href, linkLabel }: { id: string; title: string; description: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-2">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {href && linkLabel && (
        <Link href={href} className="text-xs font-medium text-primary hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <CardAction>
      <Link href={href} className="text-xs font-medium text-primary hover:underline">
        {children}
      </Link>
    </CardAction>
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const [organizations, displayNames] = await Promise.all([OrganizationService.listAccessibleTo(session.user.id), userDisplayNames([session.user.id])]);
  const organization = organizations[0];
  const now = new Date();
  const todayKey = localDateKey(now);
  const todayLabel = formatDateKey(todayKey, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  // The linked person's first name, as the account menu shows it; the username otherwise.
  const firstName = (displayNames.get(session.user.id) ?? session.user.name ?? "").trim().split(/\s+/)[0];
  // A product dashboard opens into the day's work: a greeting and the date,
  // then the numbers (impeccable Operate mode), not a hero banner.
  const greeting = `${greetingFor(now.getHours())}${firstName ? `, ${firstName}` : ""}`;

  if (!organization) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={greeting} description={todayLabel} />
        <p className="text-sm text-muted-foreground">No organization access yet. Ask an administrator to add you to one.</p>
      </div>
    );
  }

  const organizationId = organization._id.toString();
  const [canReadEmployees, canReadLeave, canReadAttendance, canReadEvents, canReadTravel, canReadCases, canReadPayroll, canReadCompensation] = await Promise.all([
    hasPermission("employees.read", organizationId),
    hasPermission("leave.read", organizationId),
    hasPermission("attendance.read", organizationId),
    hasPermission("events.read", organizationId),
    hasPermission("travel-orders.read", organizationId),
    hasPermission("cases.read", organizationId),
    hasPermission("payroll-runs.read", organizationId),
    hasPermission("compensation.read", organizationId),
  ]);

  // Each module's data is read only when the user may see that module; a
  // null below means "not visible to you", and its widget is left out.
  const [insights, leaveRequests, attendanceRecords, monthEvents, eventCategories, travelOrders, cases, payrollRuns, compensation] = await Promise.all([
    canReadEmployees ? loadWorkforceInsights(organizationId) : null,
    canReadLeave ? LeaveRequestService.listForOrganization(organizationId) : null,
    canReadAttendance ? AttendanceService.listForOrganization(organizationId, { date: now }) : null,
    canReadEvents
      ? Promise.all([EventService.listForMonth(organizationId, todayKey.slice(0, 7)), EventService.listForMonth(organizationId, nextMonthKey(todayKey))]).then(([thisMonth, next]) => [...thisMonth, ...next])
      : null,
    canReadEvents ? EventCategoryService.listCurrent(organizationId) : null,
    canReadTravel ? TravelOrderService.listCurrent(organizationId) : null,
    canReadCases ? CaseService.listCurrent(organizationId) : null,
    canReadPayroll ? PayrollRunService.list(organizationId) : null,
    canReadCompensation ? CompensationService.listForOrganization(organizationId, todayKey) : null,
  ]);

  const pendingLeave = leaveRequests?.filter((request) => request.status === "pending").length ?? 0;
  const onLeaveToday = leaveRequests
    ? new Set(leaveRequests.filter((request) => request.status === "approved" && covers(request.startDate, request.endDate, todayKey)).map((request) => request.employeeId.toString())).size
    : null;
  const travellingToday = travelOrders
    ? new Set(
        travelOrders
          .filter((order) => order.status !== "cancelled" && covers(order.startDate, order.endDate, todayKey))
          .flatMap((order) => order.employeeIds.map((id: { toString(): string }) => id.toString())),
      ).size
    : null;
  const attendance = attendanceRecords && insights ? todaysAttendance(insights, attendanceRecords) : null;

  // Payroll: the soonest pay date among runs not yet paid out.
  const openRuns = (payrollRuns ?? []).filter((run) => run.status === "draft" || run.status === "submitted" || run.status === "approved");
  const nextRun = [...openRuns].sort((a, b) => new Date(a.payDate).getTime() - new Date(b.payDate).getTime())[0];
  const runsWith = (status: string) => payrollRuns?.filter((run) => run.status === status).length;

  const withPayTerms = new Set((compensation ?? []).filter((entry) => entry.current).map((entry) => entry.employeeId));
  const attentionCounts: AttentionCounts = {
    payrollApproved: runsWith("approved"),
    payrollSubmitted: runsWith("submitted"),
    payrollDrafts: runsWith("draft"),
    pendingLeave: leaveRequests ? pendingLeave : undefined,
    contractsEnding: insights?.contractsEnding,
    missingPayTerms: compensation && insights ? insights.activeRows.filter((row) => !withPayTerms.has(row._id.toString())).length : undefined,
    missingGovernmentIds: insights?.missingGovernmentIds,
    openCases: cases?.filter((item) => isOpenCase(item.status)).length,
  };

  const categoryNameByCode = new Map((eventCategories ?? []).map((item) => [item.code, item.name]));
  const events = monthEvents
    ? upcomingEvents(monthEvents, todayKey, 5).map((event) => ({
        id: event._id.toString(),
        title: event.title,
        date: new Date(event.date),
        time: event.time,
        category: categoryNameByCode.get(event.category) ?? event.category,
      }))
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={greeting} description={`${todayLabel} · ${organization.name}`} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {insights && (
          <MetricCard
            label="Active headcount"
            value={insights.activeRows.length}
            hint={insights.newHires90 ? `+${insights.newHires90} hired in the last 90 days` : "No new hires in 90 days"}
            icon={UserCheck}
            emphasis
            href="/people"
            testId="dashboard-stat-headcount"
          />
        )}
        {attendance && (
          <MetricCard
            label="At work today"
            value={attendance.present + attendance.late}
            hint={`of ${attendance.staff} staff${attendance.late ? ` · ${attendance.late} late` : ""}`}
            icon={CalendarCheck2}
            tone="success"
            href="/attendance"
            testId="dashboard-stat-attendance"
          />
        )}
        {onLeaveToday !== null && (
          <MetricCard
            label="On leave today"
            value={onLeaveToday}
            hint={pendingLeave ? `${pendingLeave} request${pendingLeave === 1 ? "" : "s"} awaiting approval` : "No requests waiting"}
            icon={Palmtree}
            tone={pendingLeave ? "warning" : "default"}
            href="/leave"
            testId="dashboard-stat-leave"
          />
        )}
        {payrollRuns && (
          <MetricCard
            label="Next pay date"
            value={nextRun ? formatDateKey(dateToDateKey(new Date(nextRun.payDate)), { month: "short", day: "numeric" }) : "—"}
            hint={nextRun ? `${nextRun.runNumber} · ${PAYROLL_RUN_STATUS_LABELS[nextRun.status as keyof typeof PAYROLL_RUN_STATUS_LABELS]}` : "No payroll in progress"}
            icon={Banknote}
            href={nextRun ? `/payroll/${nextRun._id.toString()}` : "/payroll"}
            testId="dashboard-stat-payroll"
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AttentionList items={buildAttentionItems(attentionCounts)} />
        </div>
        <TodayPanel dateLabel={todayLabel} attendance={attendance} onLeave={onLeaveToday} travelling={travellingToday} />
      </div>

      {insights && (
        <section className="flex flex-col gap-4" aria-labelledby="workforce-heading">
          <SectionHeading id="workforce-heading" title="Workforce" description={`${insights.activeRows.length} current staff, as of today.`} href="/people" linkLabel="View people" />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Hiring trend</CardTitle>
                <CardDescription>
                  New hires per month over the last 12 months · <span className="font-medium text-foreground tabular-nums">{insights.hiresInTrend}</span> in total
                </CardDescription>
              </CardHeader>
              <CardContent>
                <HiringTrendChart points={insights.hiringTrend} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gender</CardTitle>
                <CardDescription>Current staff</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 items-center">
                <DonutChart buckets={insights.genderBreakdown} ariaLabel="Current staff by gender" centerLabel="Staff" emptyTitle="No gender data yet" emptyDescription="Add employees to see the split." />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Deployment by project</CardTitle>
                <CardDescription>Where current staff are assigned</CardDescription>
                <CardLink href="/organization/projects">Projects</CardLink>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart
                  buckets={insights.projectBreakdown}
                  ariaLabel="Current staff by project"
                  labelClassName="w-32 sm:w-44"
                  emptyTitle="No assignments yet"
                  emptyDescription="Assign employees to projects to see where your people are deployed."
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Employment status</CardTitle>
                <CardDescription>Everyone on record</CardDescription>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart buckets={insights.statusBreakdown} ariaLabel="Employees by employment status" emptyTitle="No status data yet" emptyDescription="Add employees to see the breakdown." />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Age</CardTitle>
                <CardDescription>Current staff</CardDescription>
              </CardHeader>
              <CardContent>
                <ColumnBarChart buckets={insights.ageBreakdown} ariaLabel="Current staff by age" emptyTitle="No age data yet" emptyDescription="Add a birth date to employee records to see the age spread." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tenure</CardTitle>
                <CardDescription>Current staff, by length of service</CardDescription>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart buckets={insights.tenureBreakdown} ariaLabel="Current staff by tenure" emptyTitle="No tenure data yet" emptyDescription="Add employees to see how long staff have been with the company." />
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {(insights || events) && (
        <section className="flex flex-col gap-4" aria-labelledby="people-heading">
          <SectionHeading id="people-heading" title="People & calendar" description="Who joined, who's celebrating, and what's coming up." />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {insights && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent hires</CardTitle>
                  <CardLink href="/people">All people</CardLink>
                </CardHeader>
                <CardContent>
                  <RecentHiresList hires={insights.recentHires} />
                </CardContent>
              </Card>
            )}
            {insights && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Birthdays this month</CardTitle>
                  <CardDescription>{formatDateKey(todayKey, { month: "long" })}</CardDescription>
                </CardHeader>
                <CardContent>
                  <BirthdayList celebrants={insights.birthdaysThisMonth} />
                </CardContent>
              </Card>
            )}
            {events && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Upcoming events</CardTitle>
                  <CardLink href="/events">Calendar</CardLink>
                </CardHeader>
                <CardContent>
                  <UpcomingEventsList events={events} />
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      )}

      {organizations.length > 1 && (
        <p className="text-xs text-muted-foreground">
          You have access to {organizations.length} organizations. This dashboard shows {organization.name}.
        </p>
      )}
    </div>
  );
}
