import { Types } from "mongoose";
import { clockTime } from "@/lib/app-time";
import { connectMongoDB } from "@/server/db/connection";
import { AttendanceRecordModel, ProjectModel, ScheduleEntryModel } from "@/server/db/models";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { AttendanceStatusService } from "@/domains/catalog/attendance-status-service";
import { formatPersonName } from "@/lib/person-name";
import { dateKeyToDate, dateToDateKey } from "./schedule-service";
import { formatShiftHours } from "./schedule-export";
import { loadCurrentStaffCheck } from "./current-staff";

export type AttendanceReportRow = {
  date: string;
  weekday: number;
  employeeId: string;
  employeeNumber: string;
  name: string;
  /** null when the employee has no record that day. */
  statusCode: string | null;
  statusName: string;
  checkIn: string;
  checkOut: string;
  hoursWorked: number | null;
  site: string;
  distanceMeters: number | null;
  /** The device biometric check on self-service clock-ins; null when HR recorded the day. */
  verified: boolean | null;
  source: "Self-service" | "HR" | "";
  scheduled: string;
  notes: string;
};

export type AttendanceReport = {
  from: string;
  to: string;
  label: string;
  statuses: { code: string; name: string }[];
  rows: AttendanceReportRow[];
};

export const NO_RECORD_LABEL = "No record";

const LONG_DATE = { month: "long", day: "numeric", timeZone: "UTC" } as const;

/** "October 5, 2026", "October 1–15, 2026", "September 28 – October 3, 2026". */
export function formatReportRange(from: string, to: string): string {
  const start = dateKeyToDate(from);
  const end = dateKeyToDate(to);
  const year = (date: Date) => date.getUTCFullYear();
  const monthDay = (date: Date) => date.toLocaleDateString("en-US", LONG_DATE);
  if (from === to) return `${monthDay(start)}, ${year(start)}`;
  if (year(start) !== year(end)) return `${monthDay(start)}, ${year(start)} – ${monthDay(end)}, ${year(end)}`;
  if (start.getUTCMonth() === end.getUTCMonth()) return `${monthDay(start)}–${end.getUTCDate()}, ${year(end)}`;
  return `${monthDay(start)} – ${monthDay(end)}, ${year(end)}`;
}

function dateKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  for (let date = dateKeyToDate(from); dateToDateKey(date) <= to; date = new Date(date.getTime() + 86_400_000)) {
    keys.push(dateToDateKey(date));
  }
  return keys;
}

// Local wall-clock time, matching the daily roster screen.
function formatClock(value: Date | null | undefined): string {
  if (!value) return "";
  return clockTime(value);
}

function hoursBetween(checkInAt: Date | null | undefined, checkOutAt: Date | null | undefined): number | null {
  if (!checkInAt || !checkOutAt) return null;
  const hours = (new Date(checkOutAt).getTime() - new Date(checkInAt).getTime()) / 3_600_000;
  return hours > 0 ? Math.round(hours * 100) / 100 : null;
}

/**
 * The daily roster over a date range, for export: every current employee on
 * every day ("No record" where nothing was logged), plus anyone no longer
 * current who does have a record in the range. Each day also carries what
 * the schedule planned (ADR-027), so plan and actual sit side by side.
 */
export const AttendanceReportService = {
  async build(organizationId: string, from: string, to: string): Promise<AttendanceReport> {
    await connectMongoDB();
    const orgObjectId = new Types.ObjectId(organizationId);
    const dateRange = { $gte: dateKeyToDate(from), $lte: dateKeyToDate(to) };

    const [roster, isCurrentStaff, statuses, records, entries, projects] = await Promise.all([
      EmployeeService.listWithCurrentStatus(organizationId),
      loadCurrentStaffCheck(organizationId),
      AttendanceStatusService.listCurrent(organizationId),
      AttendanceRecordModel.find({ organizationId: orgObjectId, date: dateRange }).select("-checkIn.photo -checkOut.photo").lean(),
      ScheduleEntryModel.find({ organizationId: orgObjectId, date: dateRange }).lean(),
      ProjectModel.find({ organizationId: orgObjectId }).select("name").lean(),
    ]);

    const statusNameByCode = new Map(statuses.map((status) => [status.code, status.name]));
    const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
    const recordByDay = new Map(records.map((record) => [`${record.employeeId.toString()}|${dateToDateKey(record.date)}`, record]));
    const entryByDay = new Map(entries.map((entry) => [`${entry.employeeId.toString()}|${dateToDateKey(entry.date)}`, entry]));
    const employeesWithRecords = new Set(records.map((record) => record.employeeId.toString()));

    const employees = roster
      .filter((row) => isCurrentStaff(row.currentEmployment?.status) || employeesWithRecords.has(row._id.toString()))
      .map((row) => ({ employeeId: row._id.toString(), employeeNumber: row.employeeNumber, name: formatPersonName(row.person) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const rows: AttendanceReportRow[] = [];
    for (const date of dateKeysBetween(from, to)) {
      const weekday = dateKeyToDate(date).getUTCDay();
      for (const employee of employees) {
        const key = `${employee.employeeId}|${date}`;
        const record = recordByDay.get(key);
        const entry = entryByDay.get(key);
        const scheduled = entry
          ? entry.shift.kind === "rest"
            ? entry.shift.code
            : `${entry.shift.code} ${formatShiftHours(entry.shift.startTime ?? null, entry.shift.endTime ?? null)}`
          : "";
        const selfService = Boolean(record?.checkIn || record?.checkOut);

        rows.push({
          date,
          weekday,
          ...employee,
          statusCode: record?.status ?? null,
          statusName: record ? (statusNameByCode.get(record.status) ?? record.status) : NO_RECORD_LABEL,
          checkIn: formatClock(record?.checkInAt),
          checkOut: formatClock(record?.checkOutAt),
          hoursWorked: hoursBetween(record?.checkInAt, record?.checkOutAt),
          site: record?.projectId ? (projectNameById.get(record.projectId.toString()) ?? "") : "",
          distanceMeters: typeof record?.checkIn?.distanceMeters === "number" ? Math.round(record.checkIn.distanceMeters) : null,
          verified: record && selfService ? Boolean(record.checkIn?.verified) : null,
          source: record ? (selfService ? "Self-service" : "HR") : "",
          scheduled,
          notes: record?.notes ?? "",
        });
      }
    }

    return {
      from,
      to,
      label: formatReportRange(from, to),
      statuses: statuses.map((status) => ({ code: status.code, name: status.name })),
      rows,
    };
  },
};
