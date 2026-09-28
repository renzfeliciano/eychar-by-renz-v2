import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel, LocationModel, ProjectModel, AttendanceRecordModel, AuditLogModel } from "@/server/db/models";
import { SelfServiceAttendanceService } from "@/domains/attendance/self-service-attendance-service";
import { AttendancePolicyService } from "@/domains/attendance/attendance-policy-service";
import { WebAuthnService } from "@/domains/identity/webauthn-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

// A real WebAuthn assertion needs an actual (or virtual) authenticator to sign
// it, which is out of scope for a unit test — every other call in this suite
// hits real Mongo/service logic, unmocked; this is the one deliberate stub,
// standing in for "the platform authenticator confirmed it's really you."
const FAKE_WEBAUTHN_RESPONSE = {} as AuthenticationResponseJSON;

const SITE = { latitude: 14.5547, longitude: 121.0244 };
// 0.0018° of latitude ≈ 200 m — outside the 100 m radius seeded below.
const TWO_HUNDRED_METERS_NORTH = { latitude: SITE.latitude + 0.0018, longitude: SITE.longitude };

async function seedEmployeeWithSite(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ssa-${suffix}-${Date.now()}-${Math.random()}` });
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
  const employee = await EmployeeModel.create({
    organizationId: organization._id,
    personId: person._id,
    employeeNumber: `EMP-${suffix}-${Date.now()}-${Math.random()}`,
  });
  const location = await LocationModel.create({
    organizationId: organization._id,
    name: "Makati Site",
    code: `MKT-${Math.random()}`,
    ...SITE,
    geofenceRadiusMeters: 100,
  });
  const project = await ProjectModel.create({
    organizationId: organization._id,
    name: "Ayala Tower Fit-out",
    code: `AYALA-${Math.random()}`,
    locationId: location._id,
  });
  return {
    organizationId: organization._id.toString(),
    employeeId: employee._id.toString(),
    projectId: project._id.toString(),
    locationId: location._id.toString(),
  };
}

function clockData(overrides: Record<string, unknown> = {}) {
  return {
    ...SITE,
    accuracy: 12,
    photo: "data:image/jpeg;base64,/9j/4AAQ",
    liveness: { challenges: ["turn_left", "blink"] as ("blink" | "turn_left" | "turn_right")[] },
    webAuthn: FAKE_WEBAUTHN_RESPONSE,
    ...overrides,
  };
}

describe("SelfServiceAttendanceService", () => {
  beforeEach(async () => {
    await connectMongoDB();
    vi.spyOn(WebAuthnService, "verifyAuthentication").mockResolvedValue({ verified: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("checkIn", () => {
    it("records the selected project, geofence result, live photo, and liveness challenges", async () => {
      const { organizationId, employeeId, projectId, locationId } = await seedEmployeeWithSite("1");

      const record = await SelfServiceAttendanceService.checkIn(employeeId, organizationId, "user-1", clockData({ projectId }), {});

      expect(record.projectId?.toString()).toBe(projectId);
      expect(record.checkIn?.verified).toBe(true);
      expect(record.checkIn?.photo).toBe("data:image/jpeg;base64,/9j/4AAQ");
      expect(record.checkIn?.locationId?.toString()).toBe(locationId);
      expect(record.checkIn?.distanceMeters).toBe(0);
      expect(record.checkIn?.radiusMeters).toBe(100);
      expect(record.checkIn?.liveness?.challenges).toEqual(["turn_left", "blink"]);
      expect(record.status).toBe("present");
    });

    it("blocks a clock-in outside the site's radius, records nothing, and audits the blocked attempt", async () => {
      const { organizationId, employeeId, projectId } = await seedEmployeeWithSite("2");

      await expect(
        SelfServiceAttendanceService.checkIn(employeeId, organizationId, "user-2", clockData({ projectId, ...TWO_HUNDRED_METERS_NORTH }), {}),
      ).rejects.toThrow(/200 m from Makati Site.*within 100 m/);

      expect(await SelfServiceAttendanceService.getTodayRecord(employeeId, organizationId)).toBeNull();
      const audits = await AuditLogModel.find({ resourceId: employeeId, action: "attendance.self_check_in_blocked" }).lean();
      expect(audits).toHaveLength(1);
      expect(audits[0].metadata).toMatchObject({ projectId, distanceMeters: 200, radiusMeters: 100 });
    });

    it("blocks a project that has no clock-in site set up", async () => {
      const { organizationId, employeeId } = await seedEmployeeWithSite("3");
      const bareProject = await ProjectModel.create({ organizationId, name: "No Site Yet", code: `BARE-${Math.random()}` });

      await expect(
        SelfServiceAttendanceService.checkIn(employeeId, organizationId, "user-3", clockData({ projectId: bareProject._id.toString() }), {}),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("never lets an employee clock in at another organization's project", async () => {
      const { organizationId, employeeId } = await seedEmployeeWithSite("4");
      const other = await seedEmployeeWithSite("4b");

      await expect(
        SelfServiceAttendanceService.checkIn(employeeId, organizationId, "user-4", clockData({ projectId: other.projectId }), {}),
      ).rejects.toThrow(NotFoundError);
    });

    it("requires a project", async () => {
      const { organizationId, employeeId } = await seedEmployeeWithSite("5");

      await expect(SelfServiceAttendanceService.checkIn(employeeId, organizationId, "user-5", clockData(), {})).rejects.toThrow(BusinessRuleError);
    });

    it("rejects a second clock-in for the same employee on the same day", async () => {
      const { organizationId, employeeId, projectId } = await seedEmployeeWithSite("6");
      await SelfServiceAttendanceService.checkIn(employeeId, organizationId, "user-6", clockData({ projectId }), {});

      await expect(
        SelfServiceAttendanceService.checkIn(employeeId, organizationId, "user-6", clockData({ projectId }), {}),
      ).rejects.toThrow(ConflictError);
    });

    it("computes late/present from the selected project's own attendance policy", async () => {
      const now = new Date();
      vi.useFakeTimers({ toFake: ["Date"], now: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0) });
      const { organizationId, employeeId, projectId } = await seedEmployeeWithSite("7");
      await AttendancePolicyService.create(
        { organizationId, name: "Org default", standardStartTime: "11:00", standardEndTime: "20:00", gracePeriodMinutes: 0 },
        {},
      );
      await AttendancePolicyService.create(
        { organizationId, projectId, name: "Site early shift", standardStartTime: "07:00", standardEndTime: "16:00", gracePeriodMinutes: 0 },
        {},
      );

      const record = await SelfServiceAttendanceService.checkIn(employeeId, organizationId, "user-7", clockData({ projectId }), {});

      expect(record.status).toBe("late");
    });

    it("propagates a failed biometric confirmation instead of recording attendance", async () => {
      const { organizationId, employeeId, projectId } = await seedEmployeeWithSite("8");
      vi.spyOn(WebAuthnService, "verifyAuthentication").mockRejectedValue(new BusinessRuleError("Could not verify the biometric confirmation"));

      await expect(
        SelfServiceAttendanceService.checkIn(employeeId, organizationId, "user-8", clockData({ projectId }), {}),
      ).rejects.toThrow(BusinessRuleError);
      expect(await SelfServiceAttendanceService.getTodayRecord(employeeId, organizationId)).toBeNull();
    });
  });

  describe("checkOut", () => {
    it("clocks out within the radius of the project clocked in at", async () => {
      const { organizationId, employeeId, projectId } = await seedEmployeeWithSite("9");
      await SelfServiceAttendanceService.checkIn(employeeId, organizationId, "user-9", clockData({ projectId }), {});

      const record = await SelfServiceAttendanceService.checkOut(employeeId, organizationId, "user-9", clockData(), {});

      expect(record.checkOutAt).toBeTruthy();
      expect(record.checkOut?.verified).toBe(true);
      expect(record.checkOut?.radiusMeters).toBe(100);
    });

    it("blocks a clock-out outside the site's radius and leaves the day open", async () => {
      const { organizationId, employeeId, projectId } = await seedEmployeeWithSite("10");
      await SelfServiceAttendanceService.checkIn(employeeId, organizationId, "user-10", clockData({ projectId }), {});

      await expect(
        SelfServiceAttendanceService.checkOut(employeeId, organizationId, "user-10", clockData(TWO_HUNDRED_METERS_NORTH), {}),
      ).rejects.toThrow(BusinessRuleError);

      const record = await SelfServiceAttendanceService.getTodayRecord(employeeId, organizationId);
      expect(record?.checkOutAt).toBeUndefined();
    });

    it("still allows clocking out at a project that was deactivated after clock-in", async () => {
      const { organizationId, employeeId, projectId } = await seedEmployeeWithSite("11");
      await SelfServiceAttendanceService.checkIn(employeeId, organizationId, "user-11", clockData({ projectId }), {});
      await ProjectModel.updateOne({ _id: projectId }, { status: "inactive" });

      const record = await SelfServiceAttendanceService.checkOut(employeeId, organizationId, "user-11", clockData(), {});

      expect(record.checkOutAt).toBeTruthy();
    });

    it("uses the given project for an HR-recorded check-in that has none, and requires one", async () => {
      const { organizationId, employeeId, projectId } = await seedEmployeeWithSite("12");
      const now = new Date();
      await AttendanceRecordModel.create({
        organizationId,
        employeeId,
        date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
        checkInAt: now,
        status: "present",
      });

      await expect(SelfServiceAttendanceService.checkOut(employeeId, organizationId, "user-12", clockData(), {})).rejects.toThrow(
        BusinessRuleError,
      );

      const record = await SelfServiceAttendanceService.checkOut(employeeId, organizationId, "user-12", clockData({ projectId }), {});
      expect(record.projectId?.toString()).toBe(projectId);
      expect(record.checkOutAt).toBeTruthy();
    });

    it("rejects clocking out without having clocked in today", async () => {
      const { organizationId, employeeId } = await seedEmployeeWithSite("13");

      await expect(SelfServiceAttendanceService.checkOut(employeeId, organizationId, "user-13", clockData(), {})).rejects.toThrow(NotFoundError);
    });

    it("rejects clocking out twice in the same day", async () => {
      const { organizationId, employeeId, projectId } = await seedEmployeeWithSite("14");
      await SelfServiceAttendanceService.checkIn(employeeId, organizationId, "user-14", clockData({ projectId }), {});
      await SelfServiceAttendanceService.checkOut(employeeId, organizationId, "user-14", clockData(), {});

      await expect(SelfServiceAttendanceService.checkOut(employeeId, organizationId, "user-14", clockData(), {})).rejects.toThrow(
        BusinessRuleError,
      );
    });
  });

  it("returns null when there's no record for today yet", async () => {
    const { organizationId, employeeId } = await seedEmployeeWithSite("15");
    expect(await SelfServiceAttendanceService.getTodayRecord(employeeId, organizationId)).toBeNull();
  });
});
