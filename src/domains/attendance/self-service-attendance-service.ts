import { Types } from "mongoose";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { connectMongoDB } from "@/server/db/connection";
import { AttendanceRecordModel } from "@/server/db/models";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { AttendanceStatusService } from "@/domains/catalog/attendance-status-service";
import { WebAuthnService } from "@/domains/identity/webauthn-service";
import { AttendancePolicyService } from "./attendance-policy-service";
import { computeStatus, toCalendarDateUtc } from "./attendance-service";
import { ClockSiteService, type ClockSite } from "./clock-site-service";
import { evaluateGeofence, formatDistance, type GeofenceResult } from "./geofence";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import type { LivenessChallenge } from "@/shared/validation/attendance";

type ClockEventData = {
  projectId?: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  photo: string;
  liveness: { challenges: LivenessChallenge[] };
  webAuthn: AuthenticationResponseJSON;
};

type ClockAction = "check_in" | "check_out";

function toClockEvent(data: ClockEventData, at: Date, site: ClockSite, geofence: GeofenceResult) {
  return {
    at,
    latitude: data.latitude,
    longitude: data.longitude,
    accuracy: data.accuracy,
    photo: data.photo,
    verified: true,
    locationId: new Types.ObjectId(site.locationId),
    distanceMeters: geofence.distanceMeters,
    radiusMeters: geofence.radiusMeters,
    liveness: { challenges: data.liveness.challenges },
  };
}

/**
 * Throws (and audits the attempt) when the employee is outside the site's
 * radius. Blocked attempts are audited against the Employee — there's no
 * AttendanceRecord to hang them on — so HR can see who tried from where.
 */
async function assertWithinSite(
  action: ClockAction,
  data: ClockEventData,
  site: ClockSite,
  context: { employeeId: string; organizationId: string; actorUserId?: string },
): Promise<GeofenceResult> {
  const geofence = evaluateGeofence(data, site);
  if (geofence.withinRadius) return geofence;

  await AuditService.record({
    organizationId: context.organizationId,
    actorUserId: context.actorUserId,
    action: `attendance.self_${action}_blocked`,
    resourceType: "Employee",
    resourceId: context.employeeId,
    metadata: {
      projectId: site.projectId,
      locationId: site.locationId,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy,
      distanceMeters: geofence.distanceMeters,
      radiusMeters: geofence.radiusMeters,
    },
  });

  const verb = action === "check_in" ? "Clock-in" : "Clock-out";
  throw new BusinessRuleError(
    `You're ${formatDistance(geofence.distanceMeters)} from ${site.locationName}. ${verb} is only allowed within ${formatDistance(geofence.radiusMeters)} of the site.`,
  );
}

/**
 * Distinct from AttendanceService (HR's proxy-recording flow): every write
 * here is keyed by the *session's own* employeeId, never a client-supplied
 * one, and requires a fresh, verified WebAuthn assertion. Since ADR-026 it
 * also requires the employee to be physically at the selected project's
 * site (geofence), with a live photo taken after a liveness challenge.
 * WebAuthn is verified first so that a blocked-attempt audit entry is
 * attributable to the enrolled employee, not just to whoever holds the
 * session.
 */
export const SelfServiceAttendanceService = {
  async checkIn(employeeId: string, organizationId: string, userId: string, data: ClockEventData, actor: { userId?: string }) {
    await connectMongoDB();

    await WebAuthnService.verifyAuthentication(userId, data.webAuthn);

    if (!data.projectId) throw new BusinessRuleError("Select the project you're clocking in at");
    const site = await ClockSiteService.resolve(organizationId, data.projectId);
    const geofence = await assertWithinSite("check_in", data, site, { employeeId, organizationId, actorUserId: actor.userId });

    const now = new Date();
    const date = toCalendarDateUtc(now);
    // The site actually worked today decides the policy — not the
    // assignment's home project — so a rotating employee is measured
    // against that site's schedule.
    const resolved = await AttendancePolicyService.resolve({ organizationId, projectId: site.projectId, effectiveDate: date });
    const status = computeStatus(now, resolved?.policy ?? null);
    await AttendanceStatusService.assertValidCode(organizationId, status);

    let record;
    try {
      record = await AttendanceRecordModel.create({
        organizationId: new Types.ObjectId(organizationId),
        employeeId: new Types.ObjectId(employeeId),
        projectId: new Types.ObjectId(site.projectId),
        date,
        checkInAt: now,
        status,
        policyId: resolved?.policy._id,
        checkIn: toClockEvent(data, now, site, geofence),
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
      after: { checkInAt: record.checkInAt, status: record.status, projectId: site.projectId, distanceMeters: geofence.distanceMeters },
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

    // The clock-in's project wins; the client-sent one only fills in for a
    // check-in HR recorded on the employee's behalf (no project stamped).
    const projectId = record.projectId?.toString() ?? data.projectId;
    if (!projectId) throw new BusinessRuleError("Select the project you're clocking out from");
    const site = await ClockSiteService.resolve(organizationId, projectId, { allowInactiveProject: true });
    const geofence = await assertWithinSite("check_out", data, site, { employeeId, organizationId, actorUserId: actor.userId });

    record.projectId ??= new Types.ObjectId(site.projectId);
    record.checkOutAt = now;
    record.checkOut = toClockEvent(data, now, site, geofence);
    await record.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "attendance.self_check_out",
      resourceType: "AttendanceRecord",
      resourceId: record._id.toString(),
      after: { checkOutAt: record.checkOutAt, projectId: site.projectId, distanceMeters: geofence.distanceMeters },
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
    })
      .select("-checkIn.photo -checkOut.photo")
      .lean();
  },
};
