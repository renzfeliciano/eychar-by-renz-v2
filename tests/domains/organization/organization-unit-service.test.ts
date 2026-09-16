import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, OrganizationUnitModel } from "@/server/db/models";
import { OrganizationUnitService } from "@/domains/organization/organization-unit-service";
import { ConflictError, NotFoundError } from "@/shared/errors";

async function seedOrganization(suffix: string) {
  return OrganizationModel.create({ name: "Acme", slug: `acme-unit-${suffix}` });
}

describe("OrganizationUnitService", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await Promise.all([OrganizationModel.deleteMany({}), OrganizationUnitModel.deleteMany({})]);
  });

  it("creates a unit and lists it back for the same organization", async () => {
    const organization = await seedOrganization("1");

    const unit = await OrganizationUnitService.create(
      { organizationId: organization._id.toString(), type: "department", name: "Engineering", code: "ENG" },
      {},
    );

    const units = await OrganizationUnitService.listCurrent(organization._id.toString());
    expect(units).toHaveLength(1);
    expect(units[0]._id.toString()).toBe(unit._id.toString());
  });

  it("accepts a parentUnitId that belongs to the same organization", async () => {
    const organization = await seedOrganization("2");
    const parent = await OrganizationUnitService.create(
      { organizationId: organization._id.toString(), type: "division", name: "Operations", code: "OPS" },
      {},
    );

    const child = await OrganizationUnitService.create(
      {
        organizationId: organization._id.toString(),
        parentUnitId: parent._id.toString(),
        type: "department",
        name: "Field Operations",
        code: "OPS-FIELD",
      },
      {},
    );

    expect(child.parentUnitId?.toString()).toBe(parent._id.toString());
  });

  it("rejects a parentUnitId that belongs to a different organization", async () => {
    const organization = await seedOrganization("3");
    const otherOrganization = await seedOrganization("3-other");
    const foreignParent = await OrganizationUnitService.create(
      { organizationId: otherOrganization._id.toString(), type: "division", name: "Other Org Division", code: "OTH" },
      {},
    );

    await expect(
      OrganizationUnitService.create(
        {
          organizationId: organization._id.toString(),
          parentUnitId: foreignParent._id.toString(),
          type: "department",
          name: "Engineering",
          code: "ENG",
        },
        {},
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects a duplicate code within the same organization", async () => {
    const organization = await seedOrganization("4");
    await OrganizationUnitService.create(
      { organizationId: organization._id.toString(), type: "department", name: "Engineering", code: "ENG" },
      {},
    );

    await expect(
      OrganizationUnitService.create(
        { organizationId: organization._id.toString(), type: "department", name: "Engineering 2", code: "ENG" },
        {},
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("updates status and audits the change", async () => {
    const organization = await seedOrganization("6");
    const unit = await OrganizationUnitService.create(
      { organizationId: organization._id.toString(), type: "department", name: "Engineering", code: "ENG" },
      {},
    );

    const updated = await OrganizationUnitService.updateStatus(
      unit._id.toString(),
      organization._id.toString(),
      { status: "inactive" },
      {},
    );

    expect(updated.status).toBe("inactive");
  });

  it("rejects updating a unit that belongs to a different organization", async () => {
    const organization = await seedOrganization("7");
    const otherOrganization = await seedOrganization("7-other");
    const unit = await OrganizationUnitService.create(
      { organizationId: otherOrganization._id.toString(), type: "department", name: "Engineering", code: "ENG" },
      {},
    );

    await expect(
      OrganizationUnitService.updateStatus(unit._id.toString(), organization._id.toString(), { status: "inactive" }, {}),
    ).rejects.toThrow(NotFoundError);
  });

  it("excludes a unit whose effectiveTo has already passed from listCurrent", async () => {
    const organization = await seedOrganization("5");
    await OrganizationUnitModel.create({
      organizationId: organization._id,
      type: "department",
      name: "Legacy",
      code: "LEGACY",
      effectiveFrom: new Date(Date.now() - 10_000),
      effectiveTo: new Date(Date.now() - 5_000),
    });

    const units = await OrganizationUnitService.listCurrent(organization._id.toString());

    expect(units).toHaveLength(0);
  });
});
