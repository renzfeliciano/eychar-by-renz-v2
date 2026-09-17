import { Types } from "mongoose";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { connectMongoDB } from "@/server/db/connection";
import { AttendanceRecordModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { AttendanceStatusService } from "@/domains/catalog/attendance-status-service";
import { EmployeeAssignmentService } from "@/domains/workforce/employee-assignment-service";
import { WebAuthnService } from "@/domains/identity/webauthn-service";
import { AttendancePolicyService } from "./attendance-policy-service";
import { computeStatus, toCalendarDateUtc } from "./attendance-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";

type ClockEventData = {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  photo?: string;
  webAuthn: AuthenticationResponseJSON;
};

function toClockEvent(data: ClockEventData, at: Date, verified: boolean) {
  return {
    at,
    latitude: data.latitude,
    longitude: data.longitude,
    accuracy: data.accuracy,
    photo: data.photo,
    verified,
  };
}

/**
 * Distinct from AttendanceService (HR's proxy-recording flow): every write
 * here is keyed by the *session's own* employeeId, never a client-supplied
 * one, and every write requires a fresh, verified WebAuthn assertion —
 * this is the one flow in the app where biometric confirmation is
 * mandatory, not optional metadata.
 */
export const SelfServiceAttendanceService = {
  async checkIn(employeeId: string, organizationId: string, userId: string, data: ClockEventData, actor: { userId?: string }) {
    await connectMongoDB();

    await WebAuthnService.verifyAuthentication(userId, data.webAuthn);

    const now = new Date();
    const date = toCalendarDateUtc(now);
    const assignment = await EmployeeAssignmentService.getAsOf(employeeId, date);
    const resolved = await AttendancePolicyService.resolve({
      organizationId,
      projectId: assignment?.projectId?.toString(),
      effectiveDate: date,
    });
    const status = computeStatus(now, resolved?.policy ?? null);
    await AttendanceStatusService.assertValidCode(organizationId, status);

    let record;
    try {
      record = await AttendanceRecordModel.create({
        organizationId: new Types.ObjectId(organizationId),
        employeeId: new Types.ObjectId(employeeId),
        date,
        checkInAt: now,
        status,
        policyId: resolved?.policy._id,
        checkIn: toClockEvent(data, now, true),
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError("You've already clocked in today");
      }
      throw error;
    }

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "attendance.self_check_in",
      resourceType: "AttendanceRecord",
      resourceId: record._id.toString(),
      after: { checkInAt: record.checkInAt, status: record.status },
    });

    return record;
  },

  async checkOut(employeeId: string, organizationId: string, userId: string, data: ClockEventData, actor: { userId?: string }) {
    await connectMongoDB();

    await WebAuthnService.verifyAuthentication(userId, data.webAuthn);

    const now = new Date();
    const date = toCalendarDateUtc(now);

    const record = await AttendanceRecordModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      employeeId: new Types.ObjectId(employeeId),
      date,
    });
    if (!record) throw new NotFoundError("You haven't clocked in today");
    if (record.checkOutAt) throw new BusinessRuleError("You've already clocked out today");

    record.checkOutAt = now;
    record.checkOut = toClockEvent(data, now, true);
    await record.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "attendance.self_check_out",
      resourceType: "AttendanceRecord",
      resourceId: record._id.toString(),
      after: { checkOutAt: record.checkOutAt },
    });

    return record;
  },

  async getTodayRecord(employeeId: string, organizationId: string) {
    await connectMongoDB();
    const date = toCalendarDateUtc(new Date());
    return AttendanceRecordModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      employeeId: new Types.ObjectId(employeeId),
      date,
    }).lean();
  },
};
