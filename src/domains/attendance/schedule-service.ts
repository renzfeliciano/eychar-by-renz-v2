import { Types, type AnyBulkWriteOperation } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { EmployeeModel, ProjectModel, ScheduleEntryModel, ShiftTemplateModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { EmployeeService } from "@/domains/workforce/employee-service";
import { loadCurrentStaffCheck } from "./current-staff";
import { formatPersonName } from "@/lib/person-name";
import { dateKeyToDate, dateToDateKey } from "@/lib/date-key";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import type { ScheduleEntryInput, ShiftKind, ShiftPattern } from "@/shared/validation/schedule";

// Calendar-day keys ("2026-10-05" ↔ UTC midnight) are shared with payroll;
// re-exported here so existing imports keep working.
export { dateKeyToDate, dateToDateKey, localDateKey } from "@/lib/date-key";

export type ScheduleDay = { date: string; day: number; weekday: number; isWeekend: boolean };

export type ScheduleCell = {
  shiftTemplateId: string;
  code: string;
  name: string;
  kind: ShiftKind;
  /** Palette key (src/domains/attendance/shift-colors.ts). */
  color: string;
  pattern: ShiftPattern;
  startTime: string | null;
  endTime: string | null;
  /** Flexi shifts: the latest start and hours to work (startTime is the earliest start). */
  latestStartTime: string | null;
  requiredHours: number | null;
  /** HR set this day's own hours instead of the shift's. */
  customTimes: boolean;
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

export type RosterMember = { employeeId: string; employeeNumber: string; name: string; included: boolean };

type ShiftTemplateLike = {
  code: string;
  name: string;
  kind: string;
  color?: string | null;
  pattern?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  latestStartTime?: string | null;
  requiredHours?: number | null;
};

/**
 * What gets stored on the day: the shift as it is now (so later template
 * edits never rewrite a planned month), or, with custom hours, a fixed
 * start/end for that one day, flagged as custom.
 */
function snapshotShift(shift: ShiftTemplateLike, entry: Pick<ScheduleEntryInput, "startTime" | "endTime">) {
  const base = { code: shift.code, name: shift.name, kind: shift.kind, color: shift.color ?? undefined };
  if (entry.startTime && entry.endTime) {
    return { ...base, pattern: "fixed", startTime: entry.startTime, endTime: entry.endTime, customTimes: true };
  }
  return {
    ...base,
    pattern: shift.pattern ?? "fixed",
    startTime: shift.startTime ?? undefined,
    endTime: shift.endTime ?? undefined,
    latestStartTime: shift.latestStartTime ?? undefined,
    requiredHours: shift.requiredHours ?? undefined,
    customTimes: false,
  };
}


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

    const [roster, isCurrentStaff, entries, projects, templates] = await Promise.all([
      EmployeeService.listWithCurrentStatus(organizationId),
      loadCurrentStaffCheck(organizationId),
      ScheduleEntryModel.find({
        organizationId: orgObjectId,
        date: { $gte: dateKeyToDate(days[0].date), $lte: dateKeyToDate(days[days.length - 1].date) },
      }).lean(),
      ProjectModel.find({ organizationId: orgObjectId }).select("name").lean(),
      ShiftTemplateModel.find({ organizationId: orgObjectId }).select("color").lean(),
    ]);

    // Days scheduled before shifts had colors take the shift's current one.
    const templateColorById = new Map(templates.map((template) => [template._id.toString(), template.color as string | undefined]));
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
        color: entry.shift.color ?? templateColorById.get(entry.shiftTemplateId.toString()) ?? (entry.shift.kind === "rest" ? "slate" : "blue"),
        pattern: (entry.shift.pattern as ShiftPattern | undefined) ?? "fixed",
        startTime: entry.shift.startTime ?? null,
        endTime: entry.shift.endTime ?? null,
        latestStartTime: entry.shift.latestStartTime ?? null,
        requiredHours: entry.shift.requiredHours ?? null,
        customTimes: Boolean(entry.shift.customTimes),
        projectId,
        projectName: projectId ? (projectNameById.get(projectId) ?? null) : null,
      };
      cellsByEmployee.set(employeeKey, cells);
    }

    // Current staff, plus anyone with shifts this month so a past month still
    // reads complete, minus anyone HR has taken off the schedule roster.
    const rows = roster
      .filter((row) => !row.excludedFromSchedule)
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
    for (const entry of batch) {
      if (!entry.startTime && !entry.endTime) continue;
      const shift = entry.shiftTemplateId ? shiftById.get(entry.shiftTemplateId) : undefined;
      if (!shift || shift.kind !== "work") throw new BusinessRuleError("Custom hours only apply to a work shift");
      if (!entry.startTime || !entry.endTime) throw new BusinessRuleError("Custom hours need both a start and an end time");
      if (entry.startTime === entry.endTime) throw new BusinessRuleError("Custom hours can't start and end at the same time");
    }
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
                shift: snapshotShift(shift, entry),
                ...(projectId ? { projectId: new Types.ObjectId(projectId) } : {}),
              },
              ...(projectId ? {} : { $unset: { projectId: "" } }),
            },
          },
        });
        saved += 1;
      }

      const changes = changesByEmployee.get(entry.employeeId) ?? [];
      changes.push({
        date: entry.date,
        shift: shift?.code ?? null,
        projectId,
        ...(shift && entry.startTime ? { customHours: `${entry.startTime}-${entry.endTime}` } : {}),
      });
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

  /** Current staff with whether they're on the schedule; HR manages this from the Schedules page. */
  async getRoster(organizationId: string): Promise<RosterMember[]> {
    const [roster, isCurrentStaff] = await Promise.all([EmployeeService.listWithCurrentStatus(organizationId), loadCurrentStaffCheck(organizationId)]);
    return roster
      .filter((row) => row.person && isCurrentStaff(row.currentEmployment?.status))
      .map((row) => ({
        employeeId: row._id.toString(),
        employeeNumber: row.employeeNumber ?? "",
        name: formatPersonName(row.person),
        included: !row.excludedFromSchedule,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  /** Puts employees on (or takes them off) the schedule. Their scheduled days stay stored either way. */
  async setRosterMembership(organizationId: string, changes: { employeeId: string; included: boolean }[], actor: { userId?: string }) {
    await connectMongoDB();
    const orgObjectId = new Types.ObjectId(organizationId);
    const byEmployee = new Map(changes.map((change) => [change.employeeId, change.included]));
    const employeeIds = uniqueIds([...byEmployee.keys()]);

    const employees = await EmployeeModel.find({ _id: { $in: employeeIds }, organizationId: orgObjectId }).select("excludedFromSchedule").lean();
    if (employees.length !== employeeIds.length) throw new NotFoundError("Employee not found in this organization");

    const changed = employees.filter((employee) => !employee.excludedFromSchedule !== byEmployee.get(employee._id.toString()));
    if (changed.length === 0) return { updated: 0 };

    await EmployeeModel.bulkWrite(
      changed.map((employee) => ({
        updateOne: { filter: { _id: employee._id, organizationId: orgObjectId }, update: { $set: { excludedFromSchedule: !byEmployee.get(employee._id.toString()) } } },
      })),
    );

    await Promise.all(
      changed.map((employee) =>
        AuditService.record({
          organizationId,
          actorUserId: actor.userId,
          action: "schedule.roster-updated",
          resourceType: "Employee",
          resourceId: employee._id.toString(),
          before: { includedInSchedule: !employee.excludedFromSchedule },
          after: { includedInSchedule: byEmployee.get(employee._id.toString()) },
        }),
      ),
    );

    return { updated: changed.length };
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
