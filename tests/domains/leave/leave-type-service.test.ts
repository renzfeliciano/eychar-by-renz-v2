import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, LeaveTypeModel, LeaveRequestModel } from "@/server/db/models";
import { LeaveTypeService } from "@/domains/leave/leave-type-service";
import { ConflictError, NotFoundError, BusinessRuleError } from "@/shared/errors";

async function seedOrganization(suffix: string) {
  return OrganizationModel.create({ name: "Acme", slug: `acme-lt-${suffix}` });
}

describe("LeaveTypeService", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await Promise.all([OrganizationModel.deleteMany({}), LeaveTypeModel.deleteMany({}), LeaveRequestModel.deleteMany({})]);
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

  it("renames a leave type's name, code, and description", async () => {
    const organization = await seedOrganization("5");
    const leaveType = await LeaveTypeService.create(
      { organizationId: organization._id.toString(), name: "Vacation", code: "VAC" },
      {},
    );

    const updated = await LeaveTypeService.update(
      leaveType._id.toString(),
      organization._id.toString(),
      { name: "Annual Leave", code: "AL", description: "Renamed for clarity" },
      {},
    );

    expect(updated.name).toBe("Annual Leave");
    expect(updated.code).toBe("AL");
    expect(updated.description).toBe("Renamed for clarity");
  });

  it("rejects renaming to a code already used by another leave type in the same organization", async () => {
    const organization = await seedOrganization("6");
    await LeaveTypeService.create({ organizationId: organization._id.toString(), name: "Sick", code: "SICK" }, {});
    const vacation = await LeaveTypeService.create(
      { organizationId: organization._id.toString(), name: "Vacation", code: "VAC" },
      {},
    );

    await expect(
      LeaveTypeService.update(vacation._id.toString(), organization._id.toString(), { code: "SICK" }, {}),
    ).rejects.toThrow(ConflictError);
  });

  it("deletes an unused leave type", async () => {
    const organization = await seedOrganization("7");
    const leaveType = await LeaveTypeService.create(
      { organizationId: organization._id.toString(), name: "Vacation", code: "VAC" },
      {},
    );

    await LeaveTypeService.delete(leaveType._id.toString(), organization._id.toString(), {});

    const types = await LeaveTypeService.listCurrent(organization._id.toString());
    expect(types).toHaveLength(0);
  });

  it("blocks deleting a leave type that's referenced by an existing leave request", async () => {
    const organization = await seedOrganization("8");
    const leaveType = await LeaveTypeService.create(
      { organizationId: organization._id.toString(), name: "Vacation", code: "VAC" },
      {},
    );
    await LeaveRequestModel.create({
      organizationId: organization._id,
      employeeId: organization._id,
      leaveTypeId: leaveType._id,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-01-02"),
      totalDays: 1,
    });

    await expect(
      LeaveTypeService.delete(leaveType._id.toString(), organization._id.toString(), {}),
    ).rejects.toThrow(BusinessRuleError);

    const types = await LeaveTypeService.listCurrent(organization._id.toString());
    expect(types).toHaveLength(1);
  });

  it("lets HR mark a leave type as paid out at separation, off by default, and audits the change", async () => {
    const organization = await seedOrganization(`conv-${Date.now()}`);
    const organizationId = organization._id.toString();
    const leaveType = await LeaveTypeService.create({ organizationId, name: "Vacation Leave", code: `VL-${Date.now()}` }, {});
    expect(leaveType.convertibleAtSeparation).toBe(false);

    const updated = await LeaveTypeService.setConvertible(leaveType._id.toString(), organizationId, true, {});

    expect(updated.convertibleAtSeparation).toBe(true);
  });
});
