import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import {
  Building2,
  Users,
  ClipboardCheck,
  CalendarDays,
  Banknote,
  ArrowRight,
  UserCheck,
  ClockAlert,
  Clock,
  PartyPopper,
  type LucideIcon,
} from "lucide-react";
import { authOptions } from "@/server/auth/options";
import { OrganizationService } from "@/domains/organization/organization-service";
import { hasPermission } from "@/app/_shared/has-permission";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { EmploymentStatusService } from "@/domains/catalog/employment-status-service";
import { LeaveRequestService } from "@/domains/leave/leave-request-service";
import { AttendanceService } from "@/domains/attendance/attendance-service";
import { EventService } from "@/domains/events/event-service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { calculateAge } from "@/lib/employee-dates";
import { formatPersonName } from "@/lib/person-name";
import { HorizontalBarChart } from "./horizontal-bar-chart";
import { ColumnBarChart } from "./column-bar-chart";
import { DonutChart } from "./donut-chart";
import { HiringTrendChart } from "./hiring-trend-chart";
import { RecentHiresList } from "./recent-hires-list";
import { BirthdayList } from "./birthday-list";
import type { ColoredBucket, HiringTrendPoint } from "./dashboard-types";

const SERIES_COLORS = ["var(--viz-series-1)", "var(--viz-series-2)", "var(--viz-series-3)", "var(--viz-series-4)", "var(--viz-series-5)"];
const ORDINAL_COLORS = ["var(--viz-ordinal-1)", "var(--viz-ordinal-2)", "var(--viz-ordinal-3)", "var(--viz-ordinal-4)"];
const AGE_BUCKETS = ["Under 30", "30–39", "40–49", "50+"];
const TENURE_BUCKETS = ["Under 1 year", "1–3 years", "3–5 years", "5+ years"];
const HIRING_TREND_MONTHS = 12;

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

type WorkforceInsights = {
  activeHeadcount: number;
  statusBreakdown: ColoredBucket[];
  genderBreakdown: ColoredBucket[];
  ageBreakdown: ColoredBucket[];
  tenureBreakdown: ColoredBucket[];
  hiringTrend: HiringTrendPoint[];
  recentHires: { employeeId: string; name: string; dateHired: Date }[];
  birthdaysThisMonth: { employeeId: string; name: string; birthDate: Date; turningAge: number }[];
};

async function loadWorkforceInsights(organizationId: string): Promise<WorkforceInsights> {
  const [roster, employmentStatuses] = await Promise.all([
    EmployeeService.listWithCurrentStatus(organizationId),
    EmploymentStatusService.listCurrent(organizationId),
  ]);

  const activeStatusCodes = new Set(
    employmentStatuses.filter((status) => status.metadata?.isActiveHeadcount).map((status) => status.code),
  );
  const activeRows = roster.filter((row) => row.currentEmployment?.status && activeStatusCodes.has(row.currentEmployment.status));

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
  const genderBreakdown: ColoredBucket[] = ["Male", "Female"].map((label, index) => ({
    label,
    count: genderCounts.get(label) ?? 0,
    color: SERIES_COLORS[index],
  }));

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

  const months = trailingMonths(HIRING_TREND_MONTHS);
  const hireCountByMonth = new Map<string, number>();
  for (const row of roster) {
    if (!row.currentEmployment?.effectiveFrom) continue;
    const d = new Date(row.currentEmployment.effectiveFrom);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    hireCountByMonth.set(key, (hireCountByMonth.get(key) ?? 0) + 1);
  }
  const hiringTrend: HiringTrendPoint[] = months.map(({ key, label }) => ({ month: key, label, count: hireCountByMonth.get(key) ?? 0 }));

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

  return {
    activeHeadcount: activeRows.length,
    statusBreakdown,
    genderBreakdown,
    ageBreakdown,
    tenureBreakdown,
    hiringTrend,
    recentHires,
    birthdaysThisMonth,
  };
}

const QUICK_LINKS = [
  { href: "/organization/units", label: "Organization structure", description: "Units, positions, locations, projects", icon: Building2 },
  { href: "/people", label: "People", description: "Roster, hiring, transfers", icon: Users },
  { href: "/attendance", label: "Attendance", description: "Daily roster and adjustments", icon: ClipboardCheck },
  { href: "/leave", label: "Leave", description: "Requests and approvals", icon: CalendarDays },
  { href: "/payroll", label: "Payroll", description: "Runs, policies, compensation", icon: Banknote },
];

type StatWidget = {
  key: string;
  href: string;
  label: string;
  value: number;
  icon: LucideIcon;
  tone: "primary" | "warning" | "success" | "accent";
};

const TONE_CLASSES: Record<StatWidget["tone"], { icon: string; border: string; wash: string }> = {
  primary: { icon: "bg-gradient-to-br from-primary/30 to-primary/10 text-primary", border: "border-l-primary", wash: "from-primary/10" },
  warning: { icon: "bg-gradient-to-br from-warning/35 to-warning/10 text-warning", border: "border-l-warning", wash: "from-warning/10" },
  success: { icon: "bg-gradient-to-br from-success/35 to-success/10 text-success", border: "border-l-success", wash: "from-success/10" },
  accent: { icon: "bg-gradient-to-br from-events/35 to-events/10 text-events", border: "border-l-events", wash: "from-events/10" },
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function loadStats(organizationId: string, insights: WorkforceInsights | null): Promise<StatWidget[]> {
  const [canReadLeave, canReadAttendance, canReadEvents] = await Promise.all([
    hasPermission("leave.read", organizationId),
    hasPermission("attendance.read", organizationId),
    hasPermission("events.read", organizationId),
  ]);

  const stats: StatWidget[] = [];

  if (insights) {
    stats.push({ key: "headcount", href: "/people", label: "Active headcount", value: insights.activeHeadcount, icon: UserCheck, tone: "primary" });
  }

  if (canReadLeave) {
    const pending = await LeaveRequestService.listForOrganization(organizationId, { status: "pending" });
    stats.push({ key: "pending-leave", href: "/leave", label: "Pending leave requests", value: pending.length, icon: ClockAlert, tone: "warning" });
  }

  if (canReadAttendance) {
    const today = await AttendanceService.listForOrganization(organizationId, { date: new Date() });
    stats.push({ key: "present-today", href: "/attendance", label: "Attendance recorded today", value: today.length, icon: Clock, tone: "success" });
  }

  if (canReadEvents) {
    const monthEvents = await EventService.listForMonth(organizationId, currentMonth());
    const todayUtc = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const upcoming = monthEvents.filter((event) => new Date(event.date) >= todayUtc);
    stats.push({ key: "upcoming-events", href: "/events", label: "Upcoming events this month", value: upcoming.length, icon: PartyPopper, tone: "accent" });
  }

  return stats;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const organizations = await OrganizationService.listAccessibleTo(session.user.id);
  const primaryOrganizationId = organizations[0]?._id.toString();
  const canReadEmployees = primaryOrganizationId ? await hasPermission("employees.read", primaryOrganizationId) : false;
  const insights = primaryOrganizationId && canReadEmployees ? await loadWorkforceInsights(primaryOrganizationId) : null;
  const stats = primaryOrganizationId ? await loadStats(primaryOrganizationId, insights) : [];

  return (
    <div className="flex flex-col gap-6">
      {/* A soft brand-gradient hero for the page you land on right after
          signing in — the one surface where a splash of color reads as a
          welcome, not decoration competing with dense data tables below. */}
      <section className="bg-gradient-brand rounded-2xl p-6 text-primary-foreground shadow-[var(--shadow-glow)] sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">Welcome back</h1>
        <p className="mt-1 text-sm text-primary-foreground/85 sm:text-base">
          Signed in as {session.user.name ?? session.user.email}
        </p>
      </section>

      {stats.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Link key={stat.key} href={stat.href} data-testid={`dashboard-stat-${stat.key}`}>
                <Card
                  className={`stagger-in border-l-4 bg-gradient-to-br ${TONE_CLASSES[stat.tone].wash} via-card to-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${TONE_CLASSES[stat.tone].border}`}
                  style={{ "--stagger-index": index } as CSSProperties}
                >
                  <CardContent className="flex items-center gap-3">
                    <div className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[stat.tone].icon}`}>
                      <Icon className="size-5.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-3xl leading-none font-extrabold tracking-tight">{stat.value}</p>
                      <p className="mt-1.5 truncate text-xs font-medium text-muted-foreground">{stat.label}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {insights && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Employees by status</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart
                  buckets={insights.statusBreakdown}
                  ariaLabel="Employees by employment status"
                  emptyTitle="No status data yet"
                  emptyDescription="Add employees to see the breakdown."
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gender split</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart
                  buckets={insights.genderBreakdown}
                  ariaLabel="Active employees by gender"
                  centerLabel="Employees"
                  emptyTitle="No gender data yet"
                  emptyDescription="Add employees to see the split."
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hiring trend</CardTitle>
              <CardDescription>New hires per month, last 12 months.</CardDescription>
            </CardHeader>
            <CardContent>
              <HiringTrendChart points={insights.hiringTrend} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Age</CardTitle>
              </CardHeader>
              <CardContent>
                <ColumnBarChart
                  buckets={insights.ageBreakdown}
                  ariaLabel="Active employees by age"
                  emptyTitle="No age data yet"
                  emptyDescription="Add a birth date to employee records to see the age spread."
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tenure</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart
                  buckets={insights.tenureBreakdown}
                  ariaLabel="Active employees by tenure"
                  emptyTitle="No tenure data yet"
                  emptyDescription="Add employees to see how long staff have been with the company."
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent hires</CardTitle>
              </CardHeader>
              <CardContent>
                <RecentHiresList hires={insights.recentHires} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Birthday celebrants this month</CardTitle>
              </CardHeader>
              <CardContent>
                <BirthdayList celebrants={insights.birthdaysThisMonth} />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* A single organization is already named in the topbar — repeating it
          here would just be noise. This card earns its place only when
          there's a real list to show, or nothing to show at all. */}
      {organizations.length !== 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your organizations</CardTitle>
          </CardHeader>
          <CardContent>
            {organizations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No organization access yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {organizations.map((organization) => (
                  <li key={organization._id.toString()} className="text-sm font-medium">
                    {organization.name}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_LINKS.map((link, index) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} data-testid={`dashboard-quick-link-${link.href.slice(1)}`}>
              <Card
                className="stagger-in transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent/40 hover:shadow-lg"
                style={{ "--stagger-index": stats.length + index } as CSSProperties}
              >
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/25 to-primary/10 text-primary">
                    <Icon className="size-4.5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">{link.label}</CardTitle>
                    <CardDescription>{link.description}</CardDescription>
                  </div>
                  <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover/card:translate-x-0.5" />
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
