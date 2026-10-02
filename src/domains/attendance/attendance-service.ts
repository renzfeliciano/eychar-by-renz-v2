import { Types } from "mongoose";
import { minutesOfDayInAppZone } from "@/lib/app-time";
import { connectMongoDB } from "@/server/db/connection";
import { AttendanceRecordModel, EmployeeAssignmentModel, EmployeeModel, EmploymentModel, PersonModel } from "@/server/db/models";
import { assertInOrganization } from "@/server/db/assert-in-organization";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { AttendanceStatusService } from "@/domains/catalog/attendance-status-service";
import { loadCurrentStaffCheck } from "./current-staff";
import { ConflictError, NotFoundError, BusinessRuleError } from "@/shared/errors";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";
import { assignmentsAsOf } from "@/domains/workforce/assignments-as-of";
import { AttendancePolicyService } from "./attendance-policy-service";
import type { RecordAttendanceInput, AdjustAttendanceInput } from "@/shared/validation/attendance";

// policy.standardStartTime ("09:00") is the organization's own local
// wall-clock time, not UTC — comparing it against UTC hours/minutes silently
// shifts every late/present decision by the local UTC offset, and can even
// flip an early-morning on-time check-in to "late" once that offset pushes
// it onto the previous UTC calendar day.
function minutesSinceMidnight(date: Date): number {
  return minutesOfDayInAppZone(date);
}

// Each self-service record carries up to two base64 clock photos — lists
// (roster, dashboard, API) never render them, so they don't pull them
// either (same list-vs-detail split as EmployeeDocument, ADR-025).
// photoStorage (the private blob key, ADR-038) is left out for the same reason.
const WITHOUT_PHOTOS = "-checkIn.photo -checkOut.photo -checkIn.photoStorage -checkOut.photoStorage";

function parseHHmm(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Truncates to the calendar day (UTC midnight) so the unique
 * organizationId+employeeId+date index actually enforces one record per
 * employee per day, regardless of what time-of-day was passed in. */
export function toCalendarDateUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Computed and stored at record time, using whichever policy resolves for
 * this record's own date (AGENTS.md §27) — never recomputed later against
 * today's policy. Without a resolvable policy there's nothing to compare
 * a check-in time against, so a bare check-in defaults to "present".
 */
export function computeStatus(checkInAt: Date | undefined, policy: { standardStartTime: string; gracePeriodMinutes: number } | null): "present" | "late" {
  if (!checkInAt || !policy) return "present";
  const lateThreshold = parseHHmm(policy.standardStartTime) + policy.gracePeriodMinutes;
  return minutesSinceMidnight(checkInAt) > lateThreshold ? "late" : "present";
}

export type DayRosterRow = {
  _id: Types.ObjectId;
  employeeNumber?: string;
  person?: { firstName: string; middleName?: string; lastName: string } | null;
  currentAssignment?: { projectId?: Types.ObjectId } | null;
  record?: {
    _id: Types.ObjectId;
    status: string;
    checkInAt?: Date;
    checkOutAt?: Date;
    projectId?: Types.ObjectId;
    checkIn?: { distanceMeters?: number };
  };
};

export type DayRoster = {
  rows: DayRosterRow[];
  /** Everyone on the day's roster, across all pages. */
  total: number;
  notRecorded: number;
  countByStatus: Map<string, number>;
};

export const AttendanceService = {
  async record(input: RecordAttendanceInput, actor: { userId?: string }) {
    await connectMongoDB();

    if (!input.status && !input.checkInAt) {
      throw new BusinessRuleError("Either a status or a check-in time is required");
    }
    await assertInOrganization(EmployeeModel, input.employeeId, input.organizationId, "Employee");

    const date = toCalendarDateUtc(input.date);
    const assignment = await EmployeeAssignmentService.getAsOf(input.employeeId, date);
    const resolved = await AttendancePolicyService.resolve({
      organizationId: input.organizationId,
      projectId: assignment?.projectId?.toString(),
      effectiveDate: date,
    });

    const status = input.status ?? computeStatus(input.checkInAt, resolved?.policy ?? null);
    await AttendanceStatusService.assertValidCode(input.organizationId, status);

    let record;
    try {
      record = await AttendanceRecordModel.create({
        organizationId: new Types.ObjectId(input.organizationId),
        employeeId: new Types.ObjectId(input.employeeId),
        date,
        checkInAt: input.checkInAt,
        checkOutAt: input.checkOutAt,
        status,
        policyId: resolved?.policy._id,
        notes: input.notes,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError("An attendance record already exists for this employee on this date");
      }
      throw error;
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "attendance.recorded",
      resourceType: "AttendanceRecord",
      resourceId: record._id.toString(),
      after: { status: record.status, checkInAt: record.checkInAt, checkOutAt: record.checkOutAt },
    });

    return record;
  },

  /**
   * The "Adjustments/Approval" step AGENTS.md §57 names: only a caller
   * with attendance.update reaches this (enforced by the route), and the
   * audit trail this writes — before/after, actor, timestamp — *is* the
   * approval record for this phase, rather than a separate request/approve
   * workflow state machine (that pattern belongs to Phase 6/Leave).
   */
  async adjust(
    id: string,
    organizationId: string,
    patch: Omit<AdjustAttendanceInput, "organizationId">,
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Attendance record not found in this organization");
    const record = await AttendanceRecordModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!record) throw new NotFoundError("Attendance record not found in this organization");

    if (patch.status) {
      await AttendanceStatusService.assertValidCode(organizationId, patch.status);
    }

    const before = { status: record.status, checkInAt: record.checkInAt, checkOutAt: record.checkOutAt, notes: record.notes };

    if (patch.checkInAt !== undefined) record.checkInAt = patch.checkInAt;
    if (patch.checkOutAt !== undefined) record.checkOutAt = patch.checkOutAt;
    if (patch.notes !== undefined) record.notes = patch.notes;
    record.status = patch.status ?? record.status;
    await record.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "attendance.adjusted",
      resourceType: "AttendanceRecord",
      resourceId: record._id.toString(),
      before,
      after: { status: record.status, checkInAt: record.checkInAt, checkOutAt: record.checkOutAt, notes: record.notes },
    });

    return record;
  },

  async listForEmployee(employeeId: string, organizationId: string, range: { from?: Date; to?: Date } = {}) {
    await connectMongoDB();
    const filter: Record<string, unknown> = {
      employeeId: new Types.ObjectId(employeeId),
      organizationId: new Types.ObjectId(organizationId),
    };
    if (range.from || range.to) {
      filter.date = {
        ...(range.from ? { $gte: range.from } : {}),
        ...(range.to ? { $lte: range.to } : {}),
      };
    }
    return AttendanceRecordModel.find(filter).select(WITHOUT_PHOTOS).sort({ date: -1 }).lean();
  },

  /**
   * The organization's records (for a day), optionally only those whose
   * employee was assigned, on the record's date, to `projectId` and/or to one
   * of `projectIds` (a project-scoped viewer's projects — an empty list
   * matches nothing).
   */
  async listForOrganization(organizationId: string, filters: { date?: Date; projectId?: string; projectIds?: string[] } = {}) {
    await connectMongoDB();
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (filters.date) filter.date = toCalendarDateUtc(filters.date);
    if (!filters.projectId && !filters.projectIds) {
      return AttendanceRecordModel.find(filter).select(WITHOUT_PHOTOS).sort({ date: -1 }).lean();
    }
    if (filters.projectIds && filters.projectIds.length === 0) return [];
    const records = await AttendanceRecordModel.find(filter).select(WITHOUT_PHOTOS).sort({ date: -1 }).lean();

    // One assignment query for every record, not one per record.
    const assignments = await assignmentsAsOf(records.map((record) => ({ employeeId: record.employeeId.toString(), date: record.date })));
    const named = filters.projectId?.toLowerCase();
    const allowed = filters.projectIds ? new Set(filters.projectIds.map((id) => id.toLowerCase())) : null;
    // Both given: the record's project must be the named one and within the allowed set.
    const matches = (projectId: string | undefined) => Boolean(projectId) && (!named || projectId === named) && (!allowed || allowed.has(projectId!));
    return records.filter((_, index) => matches(assignments[index]?.projectId?.toString()));
  },

  /**
   * One page of the Daily roster (current staff, plus anyone with a record
   * that day, e.g. since separated), each with that day's record, and the
   * day's counts by status over everyone on it. Who is on the roster is
   * worked out from ids and statuses alone; names and assignments are read
   * for the requested page only, so a page view doesn't load (or render)
   * the whole organization. Rows are in roster (creation) order.
   */
  async dayRoster(organizationId: string, date: Date, paging: { page: number; pageSize: number }): Promise<DayRoster> {
    await connectMongoDB();
    const orgObjectId = new Types.ObjectId(organizationId);
    const day = toCalendarDateUtc(date);

    const [employees, records, isCurrentStaff] = await Promise.all([
      EmployeeModel.find({ organizationId: orgObjectId }).select("_id").sort({ _id: 1 }).lean<{ _id: Types.ObjectId }[]>(),
      AttendanceRecordModel.find({ organizationId: orgObjectId, date: day })
        .select("employeeId status checkInAt checkOutAt projectId checkIn.distanceMeters")
        .lean<(NonNullable<DayRosterRow["record"]> & { employeeId: Types.ObjectId })[]>(),
      loadCurrentStaffCheck(organizationId),
    ]);
    const employments = employees.length
      ? await EmploymentModel.find({ employeeId: { $in: employees.map((employee) => employee._id) } })
          .select("employeeId status effectiveFrom")
          .sort({ effectiveFrom: -1 })
          .lean<{ employeeId: Types.ObjectId; status: string }[]>()
      : [];
    // The latest employment per employee, as listWithCurrentStatus picks it.
    const statusByEmployee = new Map<string, string>();
    for (const employment of employments) {
      const key = employment.employeeId.toString();
      if (!statusByEmployee.has(key)) statusByEmployee.set(key, employment.status);
    }
    const recordByEmployee = new Map(records.map((record) => [record.employeeId.toString(), record]));

    const onRoster = employees.filter((employee) => {
      const key = employee._id.toString();
      return isCurrentStaff(statusByEmployee.get(key)) || recordByEmployee.has(key);
    });
    const countByStatus = new Map<string, number>();
    let notRecorded = 0;
    for (const employee of onRoster) {
      const status = recordByEmployee.get(employee._id.toString())?.status;
      if (status === undefined) notRecorded += 1;
      else countByStatus.set(status, (countByStatus.get(status) ?? 0) + 1);
    }

    const pageIds = onRoster.slice((paging.page - 1) * paging.pageSize, paging.page * paging.pageSize).map((employee) => employee._id);
    if (pageIds.length === 0) return { rows: [], total: onRoster.length, notRecorded, countByStatus };
    const [pageEmployees, assignments] = await Promise.all([
      EmployeeModel.find({ _id: { $in: pageIds } }).select("employeeNumber personId").lean<{ _id: Types.ObjectId; employeeNumber?: string; personId: Types.ObjectId }[]>(),
      EmployeeAssignmentModel.find({ employeeId: { $in: pageIds } })
        .select("employeeId projectId effectiveFrom")
        .sort({ effectiveFrom: -1 })
        .lean<{ employeeId: Types.ObjectId; projectId?: Types.ObjectId }[]>(),
    ]);
    const persons = await PersonModel.find({ _id: { $in: pageEmployees.map((employee) => employee.personId) } })
      .select("firstName middleName lastName")
      .lean<{ _id: Types.ObjectId; firstName: string; middleName?: string; lastName: string }[]>();
    const personById = new Map(persons.map((person) => [person._id.toString(), person]));
    const employeeById = new Map(pageEmployees.map((employee) => [employee._id.toString(), employee]));
    const assignmentByEmployee = new Map<string, { projectId?: Types.ObjectId }>();
    for (const assignment of assignments) {
      const key = assignment.employeeId.toString();
      if (!assignmentByEmployee.has(key)) assignmentByEmployee.set(key, { projectId: assignment.projectId });
    }

    const rows = pageIds.map((id) => {
      const key = id.toString();
      const employee = employeeById.get(key);
      const record = recordByEmployee.get(key);
      return {
        _id: id,
        employeeNumber: employee?.employeeNumber,
        person: employee ? (personById.get(employee.personId.toString()) ?? null) : null,
        currentAssignment: assignmentByEmployee.get(key) ?? null,
        record: record ? { _id: record._id, status: record.status, checkInAt: record.checkInAt, checkOutAt: record.checkOutAt, projectId: record.projectId, checkIn: record.checkIn } : undefined,
      };
    });
    return { rows, total: onRoster.length, notRecorded, countByStatus };
  },
};
