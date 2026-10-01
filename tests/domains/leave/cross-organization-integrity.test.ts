import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel, LeaveBalanceModel, LeavePolicyModel, LeaveRequestModel, ProjectModel } from "@/server/db/models";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { LeaveBalanceService } from "@/domains/leave/leave-balance-service";
import { LeaveRequestService } from "@/domains/leave/leave-request-service";
import { LeavePolicyService } from "@/domains/leave/leave-policy-service";
import { NotFoundError } from "@/shared/errors";

async function seedOrganization(label: string) {
  const organization = await OrganizationModel.create({ name: label, slug: `acme-xorg-${label}-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  const person = await PersonModel.create({ organizationId, firstName: "Jane", lastName: label });
  const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${label}-${Math.random()}` });
  const leaveType = await LeaveTypeService.create({ organizationId, name: "Vacation", code: `VAC-${label}` }, {});
  const project = await ProjectModel.create({ organizationId, name: "Site", code: `SITE-${Math.random()}` });
  return { organizationId, employeeId: employee._id.toString(), leaveTypeId: leaveType._id.toString(), projectId: project._id.toString() };
}

describe("leave records never cross organizations", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("refuses a balance for another organization's employee or leave type", async () => {
    const a = await seedOrganization("A");
    const b = await seedOrganization("B");

    await expect(LeaveBalanceService.create({ organizationId: b.organizationId, employeeId: a.employeeId, leaveTypeId: b.leaveTypeId, year: 2026, entitledDays: 99 }, {})).rejects.toThrow(NotFoundError);
    await expect(LeaveBalanceService.create({ organizationId: b.organizationId, employeeId: b.employeeId, leaveTypeId: a.leaveTypeId, year: 2026, entitledDays: 99 }, {})).rejects.toThrow(NotFoundError);
    await expect(LeaveBalanceService.grantMissing({ organizationId: b.organizationId, leaveTypeId: a.leaveTypeId, year: 2026, entitledDays: 5 }, {})).rejects.toThrow(NotFoundError);
    expect(await LeaveBalanceModel.countDocuments({ organizationId: b.organizationId })).toBe(0);
  });

  it("refuses a leave request with another organization's leave type or employee", async () => {
    const a = await seedOrganization("A");
    const b = await seedOrganization("B");
    const dates = { startDate: new Date("2026-11-02"), endDate: new Date("2026-11-03") };

    await expect(LeaveRequestService.create({ organizationId: b.organizationId, employeeId: b.employeeId, leaveTypeId: a.leaveTypeId, ...dates }, {})).rejects.toThrow(NotFoundError);
    await expect(LeaveRequestService.create({ organizationId: b.organizationId, employeeId: a.employeeId, leaveTypeId: b.leaveTypeId, ...dates }, {})).rejects.toThrow(NotFoundError);
    expect(await LeaveRequestModel.countDocuments({ organizationId: b.organizationId })).toBe(0);
  });

  it("refuses a leave policy for another organization's leave type or project", async () => {
    const a = await seedOrganization("A");
    const b = await seedOrganization("B");

    await expect(LeavePolicyService.create({ organizationId: b.organizationId, leaveTypeId: a.leaveTypeId, name: "Foreign type", annualEntitlementDays: 15 }, {})).rejects.toThrow(NotFoundError);
    await expect(
      LeavePolicyService.create({ organizationId: b.organizationId, leaveTypeId: b.leaveTypeId, projectId: a.projectId, name: "Foreign project", annualEntitlementDays: 15 }, {}),
    ).rejects.toThrow(NotFoundError);
    expect(await LeavePolicyModel.countDocuments({ organizationId: b.organizationId })).toBe(0);
  });
});
