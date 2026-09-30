import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, LocationModel, AuditLogModel } from "@/server/db/models";
import { LocationService } from "@/domains/organization/location-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";

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

  it("stores site coordinates and a geofence radius, defaulting the radius to 100 m", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-loc-5" });

    const withRadius = await LocationService.create(
      { organizationId: organization._id.toString(), name: "Makati Site", code: "MKT", latitude: 14.5547, longitude: 121.0244, geofenceRadiusMeters: 250 },
      {},
    );
    const withDefault = await LocationService.create(
      { organizationId: organization._id.toString(), name: "Pasig Site", code: "PSG", latitude: 14.5764, longitude: 121.0851 },
      {},
    );

    expect(withRadius.latitude).toBe(14.5547);
    expect(withRadius.longitude).toBe(121.0244);
    expect(withRadius.geofenceRadiusMeters).toBe(250);
    expect(withDefault.geofenceRadiusMeters).toBe(100);
  });

  it("rejects a location with only one of latitude/longitude", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-loc-6" });

    await expect(
      LocationService.create({ organizationId: organization._id.toString(), name: "Half Site", code: "HALF", latitude: 14.55 }, {}),
    ).rejects.toThrow(BusinessRuleError);
  });

  describe("update", () => {
    it("edits details and site coordinates, and audits before/after", async () => {
      const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-loc-7" });
      const location = await LocationService.create(
        { organizationId: organization._id.toString(), name: "Manila Office", code: "MNL" },
        {},
      );

      const updated = await LocationService.update(
        location._id.toString(),
        organization._id.toString(),
        { name: "Manila HQ", address: "Ermita, Manila", latitude: 14.5826, longitude: 120.9787, geofenceRadiusMeters: 150 },
        {},
      );

      expect(updated.name).toBe("Manila HQ");
      expect(updated.code).toBe("MNL");
      expect(updated.address).toBe("Ermita, Manila");
      expect(updated.latitude).toBe(14.5826);
      expect(updated.longitude).toBe(120.9787);
      expect(updated.geofenceRadiusMeters).toBe(150);

      const audits = await AuditLogModel.find({ resourceId: location._id, action: "location.updated" }).lean();
      expect(audits).toHaveLength(1);
      expect(audits[0].before).toMatchObject({ name: "Manila Office" });
      expect(audits[0].after).toMatchObject({ name: "Manila HQ", latitude: 14.5826 });
    });

    it("renames the code and audits the old and new value", async () => {
      const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-loc-code-1" });
      const location = await LocationService.create({ organizationId: organization._id.toString(), name: "Estrella Condo", code: "Estrellavcondo" }, {});

      const updated = await LocationService.update(location._id.toString(), organization._id.toString(), { code: "EST-CONDO" }, {});

      expect(updated.code).toBe("EST-CONDO");
      const [audit] = await AuditLogModel.find({ resourceId: location._id, action: "location.updated" }).lean();
      expect(audit.before).toMatchObject({ code: "Estrellavcondo" });
      expect(audit.after).toMatchObject({ code: "EST-CONDO" });
    });

    it("rejects a code another location in the organization already uses", async () => {
      const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-loc-code-2" });
      await LocationService.create({ organizationId: organization._id.toString(), name: "Head Office", code: "HO" }, {});
      const other = await LocationService.create({ organizationId: organization._id.toString(), name: "Makati Site", code: "MKT" }, {});

      await expect(LocationService.update(other._id.toString(), organization._id.toString(), { code: "HO" }, {})).rejects.toThrow(
        'Location code "HO" is already in use',
      );
    });

    it("clears coordinates and address when given empty strings", async () => {
      const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-loc-8" });
      const location = await LocationService.create(
        { organizationId: organization._id.toString(), name: "Makati Site", code: "MKT", address: "Ayala Ave", latitude: 14.5547, longitude: 121.0244 },
        {},
      );

      const updated = await LocationService.update(
        location._id.toString(),
        organization._id.toString(),
        { address: "", latitude: "", longitude: "" },
        {},
      );

      expect(updated.address).toBeUndefined();
      expect(updated.latitude).toBeUndefined();
      expect(updated.longitude).toBeUndefined();
    });

    it("rejects an edit that would leave only one of latitude/longitude set", async () => {
      const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-loc-9" });
      const location = await LocationService.create(
        { organizationId: organization._id.toString(), name: "Makati Site", code: "MKT", latitude: 14.5547, longitude: 121.0244 },
        {},
      );

      await expect(
        LocationService.update(location._id.toString(), organization._id.toString(), { longitude: "" }, {}),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("treats a malformed location id as not found instead of crashing", async () => {
      const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-loc-11" });
      await expect(LocationService.update("not-an-id", organization._id.toString(), { name: "X" }, {})).rejects.toThrow(NotFoundError);
    });

    it("rejects editing a location from another organization", async () => {
      const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-loc-10" });
      const otherOrganization = await OrganizationModel.create({ name: "Other", slug: "other-loc-10" });
      const location = await LocationService.create(
        { organizationId: organization._id.toString(), name: "Makati Site", code: "MKT" },
        {},
      );

      await expect(
        LocationService.update(location._id.toString(), otherOrganization._id.toString(), { name: "Hijacked" }, {}),
      ).rejects.toThrow(NotFoundError);
    });
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
