import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { AuditLogModel, EmployeeModel, OrganizationModel, PersonModel, RoleAssignmentModel, RoleModel, UserModel } from "@/server/db/models";
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
    expect(await SecuritySettingsService.get(s.organizationId)).toEqual({ idleTimeoutSeconds: 60, idleWarningSeconds: 15, requireTwoStepForStaff: false });
  });

  it("lets only the Super Administrator change it, within sensible limits, and audits it", async () => {
    const s = await seed();

    await expect(SecuritySettingsService.update(s.organizationId, { idleTimeoutSeconds: 300, idleWarningSeconds: 30 }, { userId: s.hr })).rejects.toThrow(AuthorizationError);
    await expect(SecuritySettingsService.update(s.organizationId, { idleTimeoutSeconds: 60, idleWarningSeconds: 60 }, { userId: s.owner })).rejects.toThrow(ValidationError);

    await SecuritySettingsService.update(s.organizationId, { idleTimeoutSeconds: 300, idleWarningSeconds: 30 }, { userId: s.owner });

    expect(await SecuritySettingsService.get(s.organizationId)).toEqual({ idleTimeoutSeconds: 300, idleWarningSeconds: 30, requireTwoStepForStaff: false });
    expect(await AuditLogModel.countDocuments({ action: "security-settings.updated", resourceId: s.organizationId })).toBe(1);
  });

  it("finds the right limit for staff and self-service accounts alike", async () => {
    const s = await seed();
    await SecuritySettingsService.update(s.organizationId, { idleTimeoutSeconds: 120, idleWarningSeconds: 15 }, { userId: s.owner });

    expect(await SecuritySettingsService.forUser(s.owner)).toMatchObject({ idleTimeoutSeconds: 120 });
    expect(await SecuritySettingsService.forUser(s.clockUser)).toMatchObject({ idleTimeoutSeconds: 120 });
  });

  it("requires two-step for staff only once the Super Administrator has it on, and keeps it when other settings change", async () => {
    const s = await seed();
    await expect(
      SecuritySettingsService.update(s.organizationId, { idleTimeoutSeconds: 60, idleWarningSeconds: 15, requireTwoStepForStaff: true }, { userId: s.owner }),
    ).rejects.toThrow(/your own account first/);

    await UserModel.updateOne({ _id: s.owner }, { $set: { "mfa.enabled": true } });
    await SecuritySettingsService.update(s.organizationId, { idleTimeoutSeconds: 60, idleWarningSeconds: 15, requireTwoStepForStaff: true }, { userId: s.owner });
    // Saving the idle limit alone (no flag sent) leaves the requirement as it was.
    await SecuritySettingsService.update(s.organizationId, { idleTimeoutSeconds: 90, idleWarningSeconds: 15 }, { userId: s.owner });
    expect(await SecuritySettingsService.get(s.organizationId)).toEqual({ idleTimeoutSeconds: 90, idleWarningSeconds: 15, requireTwoStepForStaff: true });

    expect(await SecuritySettingsService.mustSetUpTwoStep(s.owner)).toBe(false); // already on
    expect(await SecuritySettingsService.mustSetUpTwoStep(s.clockUser)).toBe(false); // self-service is exempt
    expect(await SecuritySettingsService.staffWithoutTwoStep(s.organizationId)).toBe(0);
  });

  it("asks a staff member without two-step to set it up when the organization requires it", async () => {
    const s = await seed();
    const role = await RoleModel.create({ organizationId: s.organizationId, name: `HR ${Math.random()}`, permissionKeys: ["employees.read"] });
    await RoleAssignmentModel.create({ organizationId: s.organizationId, roleId: role._id, userId: s.hr });
    expect(await SecuritySettingsService.mustSetUpTwoStep(s.hr)).toBe(false); // not required yet

    await UserModel.updateOne({ _id: s.owner }, { $set: { "mfa.enabled": true } });
    await SecuritySettingsService.update(s.organizationId, { idleTimeoutSeconds: 60, idleWarningSeconds: 15, requireTwoStepForStaff: true }, { userId: s.owner });
    expect(await SecuritySettingsService.mustSetUpTwoStep(s.hr)).toBe(true);
    expect(await SecuritySettingsService.staffWithoutTwoStep(s.organizationId)).toBe(1);

    await UserModel.updateOne({ _id: s.hr }, { $set: { "mfa.enabled": true } });
    expect(await SecuritySettingsService.mustSetUpTwoStep(s.hr)).toBe(false);
  });
});
