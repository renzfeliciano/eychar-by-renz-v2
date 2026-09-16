import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, ProjectModel, LeavePolicyModel } from "@/server/db/models";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { LeavePolicyService } from "@/domains/leave/leave-policy-service";

async function seedOrgAndType(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-lp-${suffix}-${Date.now()}-${Math.random()}` });
  const leaveType = await LeaveTypeService.create(
    { organizationId: organization._id.toString(), name: "Vacation", code: `VAC-${suffix}` },
    {},
  );
  return { organization, leaveType };
}

describe("LeavePolicyService.resolve", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("returns null when no policy applies", async () => {
    const { organization, leaveType } = await seedOrgAndType("1");

    const result = await LeavePolicyService.resolve({
      organizationId: organization._id.toString(),
      leaveTypeId: leaveType._id.toString(),
      effectiveDate: new Date(),
    });

    expect(result).toBeNull();
  });

  it("falls back to the org-wide policy when no project-specific policy exists", async () => {
    const { organization, leaveType } = await seedOrgAndType("2");
    const orgWide = await LeavePolicyService.create(
      {
        organizationId: organization._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        name: "Org-wide vacation",
        annualEntitlementDays: 15,
      },
      {},
    );

    const result = await LeavePolicyService.resolve({
      organizationId: organization._id.toString(),
      leaveTypeId: leaveType._id.toString(),
      effectiveDate: new Date(),
    });

    expect(result?.source).toBe("organization");
    expect(result?.policy._id.toString()).toBe(orgWide._id.toString());
  });

  it("prefers a project-scoped policy over the org-wide one when both cover the date", async () => {
    const { organization, leaveType } = await seedOrgAndType("3");
    const project = await ProjectModel.create({ organizationId: organization._id, name: "Project A", code: `PA-${Date.now()}` });

    await LeavePolicyService.create(
      {
        organizationId: organization._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        name: "Org-wide vacation",
        annualEntitlementDays: 15,
      },
      {},
    );
    const projectPolicy = await LeavePolicyService.create(
      {
        organizationId: organization._id.toString(),
        projectId: project._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        name: "Project A vacation",
        annualEntitlementDays: 20,
      },
      {},
    );

    const result = await LeavePolicyService.resolve({
      organizationId: organization._id.toString(),
      projectId: project._id.toString(),
      leaveTypeId: leaveType._id.toString(),
      effectiveDate: new Date(),
    });

    expect(result?.source).toBe("project");
    expect(result?.policy._id.toString()).toBe(projectPolicy._id.toString());
  });

  it("does not resolve a policy for a different leave type", async () => {
    const { organization, leaveType } = await seedOrgAndType("4");
    const otherType = await LeaveTypeService.create(
      { organizationId: organization._id.toString(), name: "Sick", code: "SICK-4" },
      {},
    );
    await LeavePolicyService.create(
      {
        organizationId: organization._id.toString(),
        leaveTypeId: leaveType._id.toString(),
        name: "Org-wide vacation",
        annualEntitlementDays: 15,
      },
      {},
    );

    const result = await LeavePolicyService.resolve({
      organizationId: organization._id.toString(),
      leaveTypeId: otherType._id.toString(),
      effectiveDate: new Date(),
    });

    expect(result).toBeNull();
  });

  it("does not pick a policy whose effective window doesn't cover the date", async () => {
    const { organization, leaveType } = await seedOrgAndType("5");
    await LeavePolicyModel.create({
      organizationId: organization._id,
      leaveTypeId: leaveType._id,
      name: "Expired",
      annualEntitlementDays: 10,
      effectiveFrom: new Date("2020-01-01"),
      effectiveTo: new Date("2020-12-31"),
    });

    const result = await LeavePolicyService.resolve({
      organizationId: organization._id.toString(),
      leaveTypeId: leaveType._id.toString(),
      effectiveDate: new Date("2026-01-01"),
    });

    expect(result).toBeNull();
  });
});
