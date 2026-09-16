import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, LeaveTypeModel } from "@/server/db/models";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { ConflictError, NotFoundError } from "@/shared/errors";

async function seedOrganization(suffix: string) {
  return OrganizationModel.create({ name: "Acme", slug: `acme-lt-${suffix}` });
}

describe("LeaveTypeService", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await Promise.all([OrganizationModel.deleteMany({}), LeaveTypeModel.deleteMany({})]);
  });

  it("creates a leave type and lists it back for the same organization", async () => {
    const organization = await seedOrganization("1");

    const leaveType = await LeaveTypeService.create(
      { organizationId: organization._id.toString(), name: "Vacation", code: "VAC" },
      {},
    );

    const types = await LeaveTypeService.listCurrent(organization._id.toString());
    expect(types).toHaveLength(1);
    expect(types[0]._id.toString()).toBe(leaveType._id.toString());
  });

  it("rejects a duplicate code within the same organization", async () => {
    const organization = await seedOrganization("2");
    await LeaveTypeService.create({ organizationId: organization._id.toString(), name: "Vacation", code: "VAC" }, {});

    await expect(
      LeaveTypeService.create({ organizationId: organization._id.toString(), name: "Vacation Leave", code: "VAC" }, {}),
    ).rejects.toThrow(ConflictError);
  });

  it("updates status and audits the change", async () => {
    const organization = await seedOrganization("3");
    const leaveType = await LeaveTypeService.create(
      { organizationId: organization._id.toString(), name: "Vacation", code: "VAC" },
      {},
    );

    const updated = await LeaveTypeService.updateStatus(
      leaveType._id.toString(),
      organization._id.toString(),
      { status: "inactive" },
      {},
    );

    expect(updated.status).toBe("inactive");
  });

  it("rejects updating a leave type that belongs to a different organization", async () => {
    const organization = await seedOrganization("4");
    const otherOrganization = await seedOrganization("4-other");
    const leaveType = await LeaveTypeService.create(
      { organizationId: otherOrganization._id.toString(), name: "Vacation", code: "VAC" },
      {},
    );

    await expect(
      LeaveTypeService.updateStatus(leaveType._id.toString(), organization._id.toString(), { status: "inactive" }, {}),
    ).rejects.toThrow(NotFoundError);
  });
});
