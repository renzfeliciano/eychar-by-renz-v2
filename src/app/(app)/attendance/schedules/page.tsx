import type { Metadata } from "next";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { ScheduleService, localDateKey } from "@/domains/attendance/schedule-service";
import { ShiftTemplateService } from "@/domains/attendance/shift-template-service";
import { ProjectService } from "@/domains/organization/project-service";
import { HolidayService } from "@/domains/holidays/holiday-service";
import { DayNoteService } from "@/domains/holidays/day-note-service";
import { buildDayInfo } from "@/domains/holidays/day-info";
import { EventService } from "@/domains/events/event-service";
import { dateToDateKey } from "@/lib/date-key";
import { monthSchema } from "@/shared/validation/schedule";
import { PageHeader } from "@/components/shared/page-header";
import { ExportDialog } from "@/components/shared/export-dialog";
import { MonthNav } from "./month-nav";
import { ScheduleGrid } from "./schedule-grid";
import { ShiftTemplatesDialog } from "./shift-templates-dialog";
import { ScheduleRosterDialog } from "./schedule-roster-dialog";
import { HolidaysDialog } from "./holidays-dialog";

export const metadata: Metadata = { title: "Schedules" };

export default async function SchedulesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: monthParam } = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("attendance.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view schedules.</p>;
  }

  const todayKey = localDateKey();
  const parsedMonth = monthSchema.safeParse(monthParam);
  const month = parsedMonth.success ? parsedMonth.data : todayKey.slice(0, 7);

  const firstDay = `${month}-01`;
  const lastDay = `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
  const [view, shifts, projects, canUpdate, roster, canReadEvents, holidays, notes] = await Promise.all([
    ScheduleService.getMonthView(organizationId, month),
    ShiftTemplateService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
    hasPermission("attendance.update", organizationId),
    ScheduleService.getRoster(organizationId),
    hasPermission("events.read", organizationId),
    HolidayService.listBetween(organizationId, firstDay, lastDay),
    DayNoteService.listBetween(organizationId, firstDay, lastDay),
  ]);
  // Company events only for people who may see the calendar.
  const events = canReadEvents ? await EventService.listForMonth(organizationId, month) : [];
  const dayInfo = buildDayInfo(
    holidays,
    events.map((event) => ({ id: event._id.toString(), date: dateToDateKey(new Date(event.date)), title: event.title, time: event.time ?? null, category: event.category })),
    notes,
  );

  const shiftOptions = shifts.map((shift) => ({
    id: shift._id.toString(),
    name: shift.name,
    code: shift.code,
    kind: shift.kind as "work" | "rest",
    pattern: (shift.pattern ?? "fixed") as "fixed" | "flexible",
    color: shift.color ?? (shift.kind === "rest" ? "slate" : "blue"),
    startTime: shift.startTime ?? null,
    endTime: shift.endTime ?? null,
    latestStartTime: shift.latestStartTime ?? null,
    requiredHours: shift.requiredHours ?? null,
    status: shift.status,
  }));
  const projectOptions = projects
    .filter((project) => project.status === "active")
    .map((project) => ({ id: project._id.toString(), label: project.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const exportHref = (format: "xlsx" | "csv") => `/api/attendance/schedules/export?organizationId=${organizationId}&month=${month}&format=${format}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Schedules"
        description="Plan each employee's shift and site for the month. Click a date for its holidays, events and notes. This is a plan only: late and present still follow the attendance policy."
        action={
          canUpdate ? (
            <div className="flex items-center gap-2">
              <HolidaysDialog organizationId={organizationId} initialYear={Number(month.slice(0, 4))} />
              <ScheduleRosterDialog organizationId={organizationId} roster={roster} />
              <ShiftTemplatesDialog organizationId={organizationId} shifts={shiftOptions} />
            </div>
          ) : undefined
        }
      />

      {/* Exports sit with the month picker because they export exactly the month on screen. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} label={view.label} />
        <ExportDialog
          title={`Export ${view.label} schedule`}
          description="Excel has the month as a grid (employees by day) in each shift's color, with a legend, plus a sheet with one row per scheduled day. CSV has the one-row-per-day list (spreadsheets can't store color in CSV)."
          testIdPrefix="schedule-export"
          targets={{ xlsx: { href: exportHref("xlsx") }, csv: { href: exportHref("csv") } }}
        />
      </div>

      <ScheduleGrid
        key={month}
        organizationId={organizationId}
        view={view}
        shifts={shiftOptions}
        projects={projectOptions}
        canUpdate={canUpdate}
        todayKey={todayKey}
        dayInfo={dayInfo}
        canReadEvents={canReadEvents}
      />
    </div>
  );
}
