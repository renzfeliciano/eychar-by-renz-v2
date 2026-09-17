import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel } from "@/server/db/models";
import { PositionService } from "@/domains/organization/position-service";
import { ConflictError } from "@/shared/errors";

describe("PositionService", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await OrganizationModel.deleteMany({});
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
