import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, EmployeeModel, OrganizationModel, PersonModel, UserModel } from "@/server/db/models";
import { SuperAdminService } from "@/domains/authorization/super-admin-service";
import { SecuritySettingsService } from "@/domains/identity/security-settings-service";
import { AuthorizationError, ValidationError } from "@/shared/errors";

async function seed() {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-sec-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  const owner = await UserModel.create({ username: `owner.${Date.now()}.${Math.random()}`, passwordHash: "x" });
  const hr = await UserModel.create({ username: `hr.${Date.now()}.${Math.random()}`, passwordHash: "x" });
  await SuperAdminService.ensure(organizationId, owner._id.toString());
  const person = await PersonModel.create({ organizationId, firstName: "Ana", lastName: "Reyes" });
  const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `E-${Math.random()}` });
  const clockUser = await UserModel.create({ username: `ana.${Date.now()}.${Math.random()}`, passwordHash: "x", employeeId: employee._id });
  return { organizationId, owner: owner._id.toString(), hr: hr._id.toString(), clockUser: clockUser._id.toString() };
}

describe("SecuritySettingsService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("starts at a 1-minute idle limit with a 15-second warning", async () => {
    const s = await seed();
    expect(await SecuritySettingsService.get(s.organizationId)).toEqual({ idleTimeoutSeconds: 60, idleWarningSeconds: 15 });
  });

  it("lets only the Super Administrator change it, within sensible limits, and audits it", async () => {
    const s = await seed();

    await expect(SecuritySettingsService.update(s.organizationId, { idleTimeoutSeconds: 300, idleWarningSeconds: 30 }, { userId: s.hr })).rejects.toThrow(AuthorizationError);
    await expect(SecuritySettingsService.update(s.organizationId, { idleTimeoutSeconds: 60, idleWarningSeconds: 60 }, { userId: s.owner })).rejects.toThrow(ValidationError);

    await SecuritySettingsService.update(s.organizationId, { idleTimeoutSeconds: 300, idleWarningSeconds: 30 }, { userId: s.owner });

    expect(await SecuritySettingsService.get(s.organizationId)).toEqual({ idleTimeoutSeconds: 300, idleWarningSeconds: 30 });
    expect(await AuditLogModel.countDocuments({ action: "security-settings.updated", resourceId: s.organizationId })).toBe(1);
  });

  it("finds the right limit for staff and self-service accounts alike", async () => {
    const s = await seed();
    await SecuritySettingsService.update(s.organizationId, { idleTimeoutSeconds: 120, idleWarningSeconds: 15 }, { userId: s.owner });

    expect(await SecuritySettingsService.forUser(s.owner)).toMatchObject({ idleTimeoutSeconds: 120 });
    expect(await SecuritySettingsService.forUser(s.clockUser)).toMatchObject({ idleTimeoutSeconds: 120 });
  });
});
