import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PersonModel, EmployeeModel, AttendancePolicyModel, AttendanceRecordModel, ProjectModel } from "@/server/db/models";
import { AttendanceService } from "@/domains/attendance/attendance-service";
import { AttendancePolicyService } from "@/domains/attendance/attendance-policy-service";
import { NotFoundError } from "@/shared/errors";

async function seedOrganization(label: string) {
  const organization = await OrganizationModel.create({ name: label, slug: `acme-att-xorg-${label}-${Date.now()}-${Math.random()}` });
  const organizationId = organization._id.toString();
  const person = await PersonModel.create({ organizationId, firstName: "Jane", lastName: label });
  const employee = await EmployeeModel.create({ organizationId, personId: person._id, employeeNumber: `EMP-${label}-${Math.random()}` });
  const project = await ProjectModel.create({ organizationId, name: "Site", code: `SITE-${Math.random()}` });
  return { organizationId, employeeId: employee._id.toString(), projectId: project._id.toString() };
}

describe("attendance records never cross organizations", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("refuses to record attendance for another organization's employee", async () => {
    const a = await seedOrganization("A");
    const b = await seedOrganization("B");

    await expect(AttendanceService.record({ organizationId: b.organizationId, employeeId: a.employeeId, date: new Date("2026-10-01"), status: "present" }, {})).rejects.toThrow(NotFoundError);
    expect(await AttendanceRecordModel.countDocuments({ employeeId: a.employeeId })).toBe(0);
  });

  it("refuses an attendance policy for another organization's project", async () => {
    const a = await seedOrganization("A");
    const b = await seedOrganization("B");

    await expect(
      AttendancePolicyService.create({ organizationId: b.organizationId, projectId: a.projectId, name: "Foreign", standardStartTime: "09:00", standardEndTime: "18:00", gracePeriodMinutes: 10 }, {}),
    ).rejects.toThrow(NotFoundError);
    expect(await AttendancePolicyModel.countDocuments({ organizationId: b.organizationId })).toBe(0);
  });

  it("treats a malformed attendance record id as not found", async () => {
    const a = await seedOrganization("A");
    await expect(AttendanceService.adjust("nope", a.organizationId, { status: "present" }, {})).rejects.toThrow(NotFoundError);
  });
});
