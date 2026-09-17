import { describe, it, expect, beforeEach, vi } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel } from "@/server/db/models";
import { SelfServiceAttendanceService } from "@/domains/attendance/self-service-attendance-service";
import { WebAuthnService } from "@/domains/identity/webauthn-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";

// A real WebAuthn assertion needs an actual (or virtual) authenticator to sign
// it, which is out of scope for a unit test — every other call in this suite
// hits real Mongo/service logic, unmocked; this is the one deliberate stub,
// standing in for "the platform authenticator confirmed it's really you."
const FAKE_WEBAUTHN_RESPONSE = {} as AuthenticationResponseJSON;

async function seedEmployee(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ssa-${suffix}-${Date.now()}-${Math.random()}` });
  const person = await PersonModel.create({ organizationId: organization._id, firstName: "Jane", lastName: "Doe" });
  const employee = await EmployeeModel.create({
    organizationId: organization._id,
    personId: person._id,
    employeeNumber: `EMP-${suffix}-${Date.now()}-${Math.random()}`,
  });
  return { organization, employee };
}

describe("SelfServiceAttendanceService", () => {
  beforeEach(async () => {
    await connectMongoDB();
    vi.spyOn(WebAuthnService, "verifyAuthentication").mockResolvedValue({ verified: true });
  });

  it("clocks in with location and photo, marking the event as biometrically verified", async () => {
    const { organization, employee } = await seedEmployee("1");

    const record = await SelfServiceAttendanceService.checkIn(
      employee._id.toString(),
      organization._id.toString(),
      "user-1",
      { latitude: 14.5, longitude: 121.0, accuracy: 10, photo: "data:image/jpeg;base64,xyz", webAuthn: FAKE_WEBAUTHN_RESPONSE },
      {},
    );

    expect(record.checkIn?.verified).toBe(true);
    expect(record.checkIn?.latitude).toBe(14.5);
    expect(record.checkIn?.photo).toBe("data:image/jpeg;base64,xyz");
    expect(record.status).toBe("present");
  });

  it("rejects a second clock-in for the same employee on the same day", async () => {
    const { organization, employee } = await seedEmployee("2");
    await SelfServiceAttendanceService.checkIn(
      employee._id.toString(),
      organization._id.toString(),
      "user-2",
      { webAuthn: FAKE_WEBAUTHN_RESPONSE },
      {},
    );

    await expect(
      SelfServiceAttendanceService.checkIn(employee._id.toString(), organization._id.toString(), "user-2", { webAuthn: FAKE_WEBAUTHN_RESPONSE }, {}),
    ).rejects.toThrow(ConflictError);
  });

  it("clocks out after clocking in", async () => {
    const { organization, employee } = await seedEmployee("3");
    await SelfServiceAttendanceService.checkIn(
      employee._id.toString(),
      organization._id.toString(),
      "user-3",
      { webAuthn: FAKE_WEBAUTHN_RESPONSE },
      {},
    );

    const record = await SelfServiceAttendanceService.checkOut(
      employee._id.toString(),
      organization._id.toString(),
      "user-3",
      { latitude: 14.6, webAuthn: FAKE_WEBAUTHN_RESPONSE },
      {},
    );

    expect(record.checkOut?.verified).toBe(true);
    expect(record.checkOut?.latitude).toBe(14.6);
    expect(record.checkOutAt).toBeTruthy();
  });

  it("rejects clocking out without having clocked in today", async () => {
    const { organization, employee } = await seedEmployee("4");

    await expect(
      SelfServiceAttendanceService.checkOut(employee._id.toString(), organization._id.toString(), "user-4", { webAuthn: FAKE_WEBAUTHN_RESPONSE }, {}),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects clocking out twice in the same day", async () => {
    const { organization, employee } = await seedEmployee("5");
    await SelfServiceAttendanceService.checkIn(
      employee._id.toString(),
      organization._id.toString(),
      "user-5",
      { webAuthn: FAKE_WEBAUTHN_RESPONSE },
      {},
    );
    await SelfServiceAttendanceService.checkOut(
      employee._id.toString(),
      organization._id.toString(),
      "user-5",
      { webAuthn: FAKE_WEBAUTHN_RESPONSE },
      {},
    );

    await expect(
      SelfServiceAttendanceService.checkOut(employee._id.toString(), organization._id.toString(), "user-5", { webAuthn: FAKE_WEBAUTHN_RESPONSE }, {}),
    ).rejects.toThrow(BusinessRuleError);
  });

  it("returns null when there's no record for today yet", async () => {
    const { organization, employee } = await seedEmployee("6");
    expect(await SelfServiceAttendanceService.getTodayRecord(employee._id.toString(), organization._id.toString())).toBeNull();
  });

  it("propagates a failed biometric confirmation instead of recording attendance", async () => {
    const { organization, employee } = await seedEmployee("7");
    vi.spyOn(WebAuthnService, "verifyAuthentication").mockRejectedValue(new BusinessRuleError("Could not verify the biometric confirmation"));

    await expect(
      SelfServiceAttendanceService.checkIn(employee._id.toString(), organization._id.toString(), "user-7", { webAuthn: FAKE_WEBAUTHN_RESPONSE }, {}),
    ).rejects.toThrow(BusinessRuleError);
  });
});
