import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, OrganizationUnitModel } from "@/server/db/models";
import { PositionService } from "@/domains/organization/position-service";
import { ConflictError, NotFoundError } from "@/shared/errors";

describe("PositionService", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await Promise.all([
      OrganizationModel.deleteMany({}),
      OrganizationUnitModel.deleteMany({}),
    ]);
  });

  it("creates a position and lists it back for the same organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-pos-1" });

    const position = await PositionService.create(
      { organizationId: organization._id.toString(), title: "Software Engineer", code: "SWE" },
      {},
    );

    const positions = await PositionService.listCurrent(organization._id.toString());
    expect(positions).toHaveLength(1);
    expect(positions[0]._id.toString()).toBe(position._id.toString());
  });

  it("accepts an organizationUnitId that belongs to the same organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-pos-2" });
    const unit = await OrganizationUnitModel.create({
      organizationId: organization._id,
      type: "department",
      name: "Engineering",
      code: "ENG",
    });

    const position = await PositionService.create(
      {
        organizationId: organization._id.toString(),
        organizationUnitId: unit._id.toString(),
        title: "Software Engineer",
        code: "SWE",
      },
      {},
    );

    expect(position.organizationUnitId?.toString()).toBe(unit._id.toString());
  });

  it("rejects an organizationUnitId that belongs to a different organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-pos-3" });
    const otherOrganization = await OrganizationModel.create({ name: "Other", slug: "other-pos-3" });
    const foreignUnit = await OrganizationUnitModel.create({
      organizationId: otherOrganization._id,
      type: "department",
      name: "Other Org Engineering",
      code: "OTH-ENG",
    });

    await expect(
      PositionService.create(
        {
          organizationId: organization._id.toString(),
          organizationUnitId: foreignUnit._id.toString(),
          title: "Software Engineer",
          code: "SWE",
        },
        {},
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects a duplicate code within the same organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-pos-4" });
    await PositionService.create(
      { organizationId: organization._id.toString(), title: "Software Engineer", code: "SWE" },
      {},
    );

    await expect(
      PositionService.create(
        { organizationId: organization._id.toString(), title: "Senior Software Engineer", code: "SWE" },
        {},
      ),
    ).rejects.toThrow(ConflictError);
  });
});
