import type { Metadata } from "next";
import { CalendarCheck2, CircleDashed, Clock3, Palmtree, UserX } from "lucide-react";
import { clockTime } from "@/lib/app-time";
import { getCurrentOrganization } from "@/app/_shared/get-current-organization";
import { hasPermission } from "@/app/_shared/has-permission";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { AttendanceService } from "@/domains/attendance/attendance-service";
import { AttendanceStatusService } from "@/domains/catalog/attendance-status-service";
import { ProjectService } from "@/domains/organization/project-service";
import { loadCurrentStaffCheck } from "@/domains/attendance/current-staff";
import { formatDistance } from "@/domains/attendance/geofence";
import { formatPersonName } from "@/lib/person-name";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { MetricCard } from "@/components/shared/metric-card";
import { DateNav } from "./date-nav";
import { RecordDialog } from "./record-dialog";
import { ExportAttendanceDialog } from "./export-attendance-dialog";

export const metadata: Metadata = { title: "Daily roster" };

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatTime(value?: Date | null): string {
  if (!value) return "—";
  // The organization's clock (Asia/Manila), not the server's: Vercel runs in UTC.
  return clockTime(value);
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: dateParam } = await searchParams;
  const { organization } = await getCurrentOrganization();
  if (!organization) return <p className="text-sm text-muted-foreground">No organization access yet.</p>;

  const organizationId = organization._id.toString();
  if (!(await hasPermission("attendance.read", organizationId))) {
    return <p className="text-sm text-muted-foreground">You don&apos;t have access to view attendance.</p>;
  }

  const date = dateParam ? new Date(dateParam) : new Date();
  const canRecord = await hasPermission("attendance.create", organizationId);

  const [roster, records, statusItems, projects, isCurrentStaff] = await Promise.all([
    EmployeeService.listWithCurrentStatus(organizationId),
    AttendanceService.listForOrganization(organizationId, { date }),
    AttendanceStatusService.listCurrent(organizationId),
    ProjectService.listCurrent(organizationId),
    loadCurrentStaffCheck(organizationId),
  ]);
  const recordByEmployeeId = new Map(records.map((record) => [record.employeeId.toString(), record]));
  const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
  const statusOptions = statusItems.map((item) => ({ id: item.code, label: item.name }));
  const statusNameByCode = new Map(statusItems.map((item) => [item.code, item.name]));

  // Current staff, plus anyone who has a record that day (e.g. since separated).
  const rows = roster.filter((row) => isCurrentStaff(row.currentEmployment?.status) || recordByEmployeeId.has(row._id.toString()));
  const count = (status: string) => rows.filter((row) => recordByEmployeeId.get(row._id.toString())?.status === status).length;
  const present = count("present");
  const late = count("late");
  const onLeave = count("on_leave");
  const absent = count("absent");
  const notRecorded = rows.filter((row) => !recordByEmployeeId.has(row._id.toString())).length;
  const dayLabel = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Daily roster"
        description="Who clocked in, when and where, for any day. Record or correct attendance on an employee's behalf."
        action={<ExportAttendanceDialog organizationId={organizationId} date={toDateInputValue(date)} />}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <DateNav date={toDateInputValue(date)} />
        <p className="text-sm text-muted-foreground">{dayLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Present" value={present} hint={`of ${rows.length} employees`} icon={CalendarCheck2} tone="success" />
        <MetricCard label="Late" value={late} hint="Past the grace period" icon={Clock3} tone={late ? "warning" : "default"} />
        <MetricCard label="Absent" value={absent} hint="Marked absent" icon={UserX} tone={absent ? "danger" : "default"} />
        <MetricCard label="On leave" value={onLeave} hint="Approved leave" icon={Palmtree} />
        <MetricCard label="Not recorded" value={notRecorded} hint={notRecorded ? "No clock-in or entry yet" : "Everyone is accounted for"} icon={CircleDashed} className="col-span-2 sm:col-span-1" />
      </div>

      <DataTable
        caption={`Attendance for ${dayLabel}`}
        columns={[
          {
            key: "name",
            header: "Employee",
            render: (row) => {
              const name = row.person ? formatPersonName(row.person) : "—";
              return (
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">
                    {initials(name)}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {row.employeeNumber}
                      {row.currentAssignment?.projectId ? ` · ${projectNameById.get(row.currentAssignment.projectId.toString()) ?? ""}` : ""}
                    </span>
                  </span>
                </div>
              );
            },
          },
          {
            key: "status",
            header: "Status",
            render: (row) => {
              const status = recordByEmployeeId.get(row._id.toString())?.status;
              return status ? <StatusBadge status={status} label={statusNameByCode.get(status)} /> : <StatusBadge status="not_recorded" label="Not recorded" tone="neutral" />;
            },
          },
          { key: "checkIn", header: "Check-in", render: (row) => formatTime(recordByEmployeeId.get(row._id.toString())?.checkInAt) },
          { key: "checkOut", header: "Check-out", render: (row) => formatTime(recordByEmployeeId.get(row._id.toString())?.checkOutAt) },
          {
            key: "site",
            header: "Site",
            render: (row) => {
              const record = recordByEmployeeId.get(row._id.toString());
              if (!record?.projectId) return <span className="text-muted-foreground">—</span>;
              const distance = record.checkIn?.distanceMeters;
              return (
                <span className="flex flex-col">
                  <span>{projectNameById.get(record.projectId.toString()) ?? "—"}</span>
                  {typeof distance === "number" && <span className="text-xs text-muted-foreground">{formatDistance(distance)} from site</span>}
                </span>
              );
            },
          },
          {
            key: "action",
            header: "",
            className: "text-right",
            render: (row) => {
              if (!canRecord) return null;
              const existing = recordByEmployeeId.get(row._id.toString());
              return (
                <RecordDialog
                  organizationId={organizationId}
                  employeeId={row._id.toString()}
                  date={toDateInputValue(date)}
                  existingRecordId={existing?._id.toString()}
                  initialCheckInAt={existing?.checkInAt}
                  initialCheckOutAt={existing?.checkOutAt}
                  initialStatus={existing?.status}
                  statusOptions={statusOptions}
                />
              );
            },
          },
        ]}
        rows={rows}
        getRowKey={(row) => row._id.toString()}
        emptyMessage="No employees yet."
        emptyDescription="Add employees under People; they'll appear here each day."
      />
    </div>
  );
}
