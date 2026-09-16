import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { AttendanceRecordModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { ConflictError, NotFoundError, BusinessRuleError } from "@/shared/errors";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";
import { AttendancePolicyService } from "./attendance-policy-service";
import type { RecordAttendanceInput, AdjustAttendanceInput } from "@/shared/validation/attendance";

function minutesSinceMidnightUtc(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function parseHHmm(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Truncates to the calendar day (UTC midnight) so the unique
 * organizationId+employeeId+date index actually enforces one record per
 * employee per day, regardless of what time-of-day was passed in. */
function toCalendarDateUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Computed and stored at record time, using whichever policy resolves for
 * this record's own date (AGENTS.md §27) — never recomputed later against
 * today's policy. Without a resolvable policy there's nothing to compare
 * a check-in time against, so a bare check-in defaults to "present".
 */
function computeStatus(checkInAt: Date | undefined, policy: { standardStartTime: string; gracePeriodMinutes: number } | null): "present" | "late" {
  if (!checkInAt || !policy) return "present";
  const lateThreshold = parseHHmm(policy.standardStartTime) + policy.gracePeriodMinutes;
  return minutesSinceMidnightUtc(checkInAt) > lateThreshold ? "late" : "present";
}

export const AttendanceService = {
  async record(input: RecordAttendanceInput, actor: { userId?: string }) {
    await connectMongoDB();

    if (!input.status && !input.checkInAt) {
      throw new BusinessRuleError("Either a status or a check-in time is required");
    }

    const date = toCalendarDateUtc(input.date);
    const assignment = await EmployeeAssignmentService.getAsOf(input.employeeId, date);
    const resolved = await AttendancePolicyService.resolve({
      organizationId: input.organizationId,
      projectId: assignment?.projectId?.toString(),
      effectiveDate: date,
    });

    const status = input.status ?? computeStatus(input.checkInAt, resolved?.policy ?? null);

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

    const record = await AttendanceRecordModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!record) throw new NotFoundError("Attendance record not found in this organization");

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
    return AttendanceRecordModel.find(filter).sort({ date: -1 }).lean();
  },

  async listForOrganization(organizationId: string, filters: { date?: Date; projectId?: string } = {}) {
    await connectMongoDB();
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (filters.date) filter.date = toCalendarDateUtc(filters.date);
    const records = await AttendanceRecordModel.find(filter).sort({ date: -1 }).lean();
    if (!filters.projectId) return records;

    const filtered = [];
    for (const record of records) {
      const assignment = await EmployeeAssignmentService.getAsOf(record.employeeId.toString(), record.date);
      if (assignment?.projectId?.toString() === filters.projectId) filtered.push(record);
    }
    return filtered;
  },
};
