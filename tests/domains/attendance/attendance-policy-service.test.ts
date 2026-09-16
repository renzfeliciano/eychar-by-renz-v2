import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, ProjectModel, AttendancePolicyModel } from "@/server/db/models";
import { AttendancePolicyService } from "@/domains/attendance/attendance-policy-service";

describe("AttendancePolicyService.resolve", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("returns null when no policy applies", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ap-${Date.now()}-${Math.random()}` });

    const result = await AttendancePolicyService.resolve({
      organizationId: organization._id.toString(),
      effectiveDate: new Date(),
    });

    expect(result).toBeNull();
  });

  it("falls back to the org-wide policy when no project-specific policy exists", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ap-${Date.now()}-${Math.random()}` });
    const orgWide = await AttendancePolicyService.create(
      { organizationId: organization._id.toString(), name: "Org-wide", standardStartTime: "09:00", standardEndTime: "18:00", gracePeriodMinutes: 10 },
      {},
    );

    const result = await AttendancePolicyService.resolve({
      organizationId: organization._id.toString(),
      effectiveDate: new Date(),
    });

    expect(result?.source).toBe("organization");
    expect(result?.policy._id.toString()).toBe(orgWide._id.toString());
  });

  it("prefers a project-scoped policy over the org-wide one when both cover the date", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ap-${Date.now()}-${Math.random()}` });
    const project = await ProjectModel.create({ organizationId: organization._id, name: "Project A", code: `PA-${Date.now()}` });

    await AttendancePolicyService.create(
      { organizationId: organization._id.toString(), name: "Org-wide", standardStartTime: "09:00", standardEndTime: "18:00", gracePeriodMinutes: 10 },
      {},
    );
    const projectPolicy = await AttendancePolicyService.create(
      {
        organizationId: organization._id.toString(),
        projectId: project._id.toString(),
        name: "Project A shift",
        standardStartTime: "07:00",
        standardEndTime: "16:00",
        gracePeriodMinutes: 5,
      },
      {},
    );

    const result = await AttendancePolicyService.resolve({
      organizationId: organization._id.toString(),
      projectId: project._id.toString(),
      effectiveDate: new Date(),
    });

    expect(result?.source).toBe("project");
    expect(result?.policy._id.toString()).toBe(projectPolicy._id.toString());
  });

  it("does not pick a policy whose effective window doesn't cover the date", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-ap-${Date.now()}-${Math.random()}` });
    await AttendancePolicyModel.create({
      organizationId: organization._id,
      name: "Expired",
      standardStartTime: "09:00",
      standardEndTime: "18:00",
      gracePeriodMinutes: 0,
      effectiveFrom: new Date("2020-01-01"),
      effectiveTo: new Date("2020-12-31"),
    });

    const result = await AttendancePolicyService.resolve({
      organizationId: organization._id.toString(),
      effectiveDate: new Date("2026-01-01"),
    });

    expect(result).toBeNull();
  });
});
