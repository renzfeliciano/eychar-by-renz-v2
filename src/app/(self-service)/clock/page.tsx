import { getSelfServiceSession } from "@/app/_shared/get-self-service-session";
import { SelfServiceAttendanceService } from "@/domains/attendance/self-service-attendance-service";
import { ClockSiteService } from "@/domains/attendance/clock-site-service";
import { ScheduleService, localDateKey } from "@/domains/attendance/schedule-service";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";
import { WebAuthnService } from "@/domains/identity/webauthn-service";
import { CalendarClock } from "lucide-react";
import { greetingFor } from "@/domains/dashboard/dashboard-summary";
import { ClockPanel } from "./clock-panel";

export default async function ClockPage() {
  const session = await getSelfServiceSession();

  const [today, hasCredential, sites, assignment, scheduled] = await Promise.all([
    SelfServiceAttendanceService.getTodayRecord(session.employeeId, session.organizationId),
    WebAuthnService.hasRegisteredCredential(session.userId),
    ClockSiteService.listForOrganization(session.organizationId),
    EmployeeAssignmentService.getAsOf(session.employeeId, new Date()),
    ScheduleService.getEntryForDate(session.organizationId, session.employeeId, localDateKey()),
  ]);

  // Pre-select today's scheduled project, else the assigned one — whichever
  // is actually a clock-in site. The employee can still pick another.
  const defaultProjectId = [scheduled?.projectId?.toString(), assignment?.projectId?.toString()].find(
    (projectId) => projectId && sites.some((site) => site.projectId === projectId),
  );
  const todayProjectId = today?.projectId?.toString() ?? null;
  const now = new Date();
  const shift = scheduled?.shift;
  const shiftSite = scheduled?.projectId ? sites.find((site) => site.projectId === scheduled.projectId?.toString())?.projectName : undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* The day at a glance: who, what date, and today's shift, above the clock itself. */}
      <section className="relative overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-soft)]" aria-label="Today">
        <span className="absolute inset-x-0 top-0 h-1 bg-primary" aria-hidden="true" />
        <div className="bg-primary/[0.035] px-5 pt-5 pb-4 dark:bg-primary/[0.08]">
          <p className="text-xs font-medium text-muted-foreground">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {greetingFor(now.getHours())}, {session.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">Employee #{session.employeeNumber ?? "—"}</p>
        </div>
        <div className="flex items-center gap-3 border-t px-5 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
            <CalendarClock className="size-4.5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Today&apos;s shift</p>
            <p className="truncate text-sm font-medium">
              {!shift
                ? "No shift scheduled"
                : shift.kind === "rest"
                  ? "Rest day"
                  : `${shift.name}${shift.startTime && shift.endTime ? ` · ${shift.startTime}–${shift.endTime}` : ""}${shiftSite ? ` · ${shiftSite}` : ""}`}
            </p>
          </div>
        </div>
      </section>
      <ClockPanel
        today={
          today
            ? {
                checkInAt: today.checkInAt ? today.checkInAt.toISOString() : null,
                checkOutAt: today.checkOutAt ? today.checkOutAt.toISOString() : null,
                status: today.status,
                projectId: todayProjectId,
                projectName: sites.find((site) => site.projectId === todayProjectId)?.projectName ?? null,
              }
            : null
        }
        hasCredential={hasCredential}
        sites={sites}
        defaultProjectId={defaultProjectId}
        nowIso={now.toISOString()}
      />
    </div>
  );
}
