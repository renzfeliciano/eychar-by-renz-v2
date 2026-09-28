import { Types, type AnyBulkWriteOperation } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, ProjectModel, ScheduleEntryModel, ShiftTemplateModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { loadCurrentStaffCheck } from "./current-staff";
import { formatPersonName } from "@/lib/person-name";
import { dateKeyToDate, dateToDateKey } from "@/lib/date-key";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import type { ScheduleEntryInput, ShiftKind } from "@/shared/validation/schedule";

// Calendar-day keys ("2026-10-05" ↔ UTC midnight) are shared with payroll;
// re-exported here so existing imports keep working.
export { dateKeyToDate, dateToDateKey, localDateKey } from "@/lib/date-key";

export type ScheduleDay = { date: string; day: number; weekday: number; isWeekend: boolean };

export type ScheduleCell = {
  shiftTemplateId: string;
  code: string;
  name: string;
  kind: ShiftKind;
  startTime: string | null;
  endTime: string | null;
  projectId: string | null;
  projectName: string | null;
};

export type ScheduleRow = {
  employeeId: string;
  employeeNumber: string;
  name: string;
  cells: Record<string, ScheduleCell>;
};

export type ScheduleMonthView = { month: string; label: string; days: ScheduleDay[]; rows: ScheduleRow[] };


export function monthDays(month: string): ScheduleDay[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, monthNumber - 1, index + 1));
    const weekday = date.getUTCDay();
    return { date: dateToDateKey(date), day: index + 1, weekday, isWeekend: weekday === 0 || weekday === 6 };
  });
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function uniqueIds(values: (string | undefined | null)[]): Types.ObjectId[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].map((value) => new Types.ObjectId(value));
}

/**
 * Monthly shift schedules (ADR-027). Reference-only: HR's plan of who works
 * which shift at which site each day. It doesn't drive late/present —
 * AttendancePolicy still does — and it never touches attendance records.
 */
export const ScheduleService = {
  async getMonthView(organizationId: string, month: string): Promise<ScheduleMonthView> {
    await connectMongoDB();
    const orgObjectId = new Types.ObjectId(organizationId);
    const days = monthDays(month);

    const [roster, isCurrentStaff, entries, projects] = await Promise.all([
      EmployeeService.listWithCurrentStatus(organizationId),
      loadCurrentStaffCheck(organizationId),
      ScheduleEntryModel.find({
        organizationId: orgObjectId,
        date: { $gte: dateKeyToDate(days[0].date), $lte: dateKeyToDate(days[days.length - 1].date) },
      }).lean(),
      ProjectModel.find({ organizationId: orgObjectId }).select("name").lean(),
    ]);

    const projectNameById = new Map(projects.map((project) => [project._id.toString(), project.name]));
    const cellsByEmployee = new Map<string, Record<string, ScheduleCell>>();
    for (const entry of entries) {
      const employeeKey = entry.employeeId.toString();
      const cells = cellsByEmployee.get(employeeKey) ?? {};
      const projectId = entry.projectId?.toString() ?? null;
      cells[dateToDateKey(entry.date)] = {
        shiftTemplateId: entry.shiftTemplateId.toString(),
        code: entry.shift.code,
        name: entry.shift.name,
        kind: entry.shift.kind as ShiftKind,
        startTime: entry.shift.startTime ?? null,
        endTime: entry.shift.endTime ?? null,
        projectId,
        projectName: projectId ? (projectNameById.get(projectId) ?? null) : null,
      };
      cellsByEmployee.set(employeeKey, cells);
    }

    // Current staff, plus anyone with shifts this month so a past month still reads complete.

    const rows = roster
      .filter((row) => isCurrentStaff(row.currentEmployment?.status) || cellsByEmployee.has(row._id.toString()))
      .map((row) => ({
        employeeId: row._id.toString(),
        employeeNumber: row.employeeNumber,
        name: formatPersonName(row.person),
        cells: cellsByEmployee.get(row._id.toString()) ?? {},
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { month, label: monthLabel(month), days, rows };
  },

  /**
   * Upserts each (employee, day); a null shift clears the day. Everything is
   * validated before anything is written, so a bad id anywhere in the batch
   * leaves the schedule untouched.
   */
  async saveEntries(organizationId: string, entries: ScheduleEntryInput[], actor: { userId?: string }) {
    await connectMongoDB();
    const orgObjectId = new Types.ObjectId(organizationId);

    // Last write wins for a day listed twice in the same batch.
    const byKey = new Map(entries.map((entry) => [`${entry.employeeId}|${entry.date}`, entry]));
    const batch = [...byKey.values()];

    const employeeIds = uniqueIds(batch.map((entry) => entry.employeeId));
    const shiftIds = uniqueIds(batch.map((entry) => entry.shiftTemplateId));
    const projectIds = uniqueIds(batch.map((entry) => entry.projectId));

    const [employees, shifts, projects] = await Promise.all([
      EmployeeModel.find({ _id: { $in: employeeIds }, organizationId: orgObjectId }).select("_id").lean(),
      ShiftTemplateModel.find({ _id: { $in: shiftIds }, organizationId: orgObjectId }).lean(),
      ProjectModel.find({ _id: { $in: projectIds }, organizationId: orgObjectId }).select("name status").lean(),
    ]);

    if (employees.length !== employeeIds.length) throw new NotFoundError("Employee not found in this organization");
    if (shifts.length !== shiftIds.length) throw new NotFoundError("Shift not found in this organization");
    if (projects.length !== projectIds.length) throw new NotFoundError("Project not found in this organization");
    const inactiveShift = shifts.find((shift) => shift.status !== "active");
    if (inactiveShift) throw new BusinessRuleError(`"${inactiveShift.name}" is an inactive shift`);
    const inactiveProject = projects.find((project) => project.status !== "active");
    if (inactiveProject) throw new BusinessRuleError(`"${inactiveProject.name}" is an inactive project`);

    const shiftById = new Map(shifts.map((shift) => [shift._id.toString(), shift]));
    const operations: AnyBulkWriteOperation[] = [];
    const changesByEmployee = new Map<string, { date: string; shift: string | null; projectId: string | null }[]>();
    let saved = 0;
    let cleared = 0;

    for (const entry of batch) {
      const filter = { organizationId: orgObjectId, employeeId: new Types.ObjectId(entry.employeeId), date: dateKeyToDate(entry.date) };
      const shift = entry.shiftTemplateId ? shiftById.get(entry.shiftTemplateId) : undefined;
      // Rest days are never "at" a site.
      const projectId = shift?.kind === "work" && entry.projectId ? entry.projectId : null;

      if (!shift) {
        operations.push({ deleteOne: { filter } });
        cleared += 1;
      } else {
        operations.push({
          updateOne: {
            filter,
            upsert: true,
            update: {
              $set: {
                shiftTemplateId: shift._id,
                shift: { code: shift.code, name: shift.name, kind: shift.kind, startTime: shift.startTime, endTime: shift.endTime },
                ...(projectId ? { projectId: new Types.ObjectId(projectId) } : {}),
              },
              ...(projectId ? {} : { $unset: { projectId: "" } }),
            },
          },
        });
        saved += 1;
      }

      const changes = changesByEmployee.get(entry.employeeId) ?? [];
      changes.push({ date: entry.date, shift: shift?.code ?? null, projectId });
      changesByEmployee.set(entry.employeeId, changes);
    }

    await ScheduleEntryModel.bulkWrite(operations, { ordered: false });

    await Promise.all(
      [...changesByEmployee].map(([employeeId, changes]) =>
        AuditService.record({
          organizationId,
          actorUserId: actor.userId,
          action: "schedule.updated",
          resourceType: "Employee",
          resourceId: employeeId,
          metadata: { changes },
        }),
      ),
    );

    return { saved, cleared };
  },

  async getEntryForDate(organizationId: string, employeeId: string, dateKey: string) {
    await connectMongoDB();
    return ScheduleEntryModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      employeeId: new Types.ObjectId(employeeId),
      date: dateKeyToDate(dateKey),
    }).lean();
  },
};
