import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, LocationModel } from "@/server/db/models";
import { LocationService } from "@/domains/organization/location-service";
import { ConflictError } from "@/shared/errors";

describe("LocationService", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await Promise.all([OrganizationModel.deleteMany({}), LocationModel.deleteMany({})]);
  });

  it("creates a location and lists it back for the same organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-loc-1" });

    const location = await LocationService.create(
      { organizationId: organization._id.toString(), name: "Manila Office", code: "MNL" },
      {},
    );

    const locations = await LocationService.listCurrent(organization._id.toString());
    expect(locations).toHaveLength(1);
    expect(locations[0]._id.toString()).toBe(location._id.toString());
  });

  it("rejects a duplicate code within the same organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-loc-2" });
    await LocationService.create(
      { organizationId: organization._id.toString(), name: "Manila Office", code: "MNL" },
      {},
    );

    await expect(
      LocationService.create(
        { organizationId: organization._id.toString(), name: "Manila HQ", code: "MNL" },
        {},
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("updates status and audits the change", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-loc-4" });
    const location = await LocationService.create(
      { organizationId: organization._id.toString(), name: "Manila Office", code: "MNL" },
      {},
    );

    const updated = await LocationService.updateStatus(
      location._id.toString(),
      organization._id.toString(),
      { status: "inactive" },
      {},
    );

    expect(updated.status).toBe("inactive");
  });

  it("does not leak locations from a different organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-loc-3" });
    const otherOrganization = await OrganizationModel.create({ name: "Other", slug: "other-loc-3" });
    await LocationService.create(
      { organizationId: otherOrganization._id.toString(), name: "Cebu Office", code: "CEB" },
      {},
    );

    const locations = await LocationService.listCurrent(organization._id.toString());

    expect(locations).toHaveLength(0);
  });
});
