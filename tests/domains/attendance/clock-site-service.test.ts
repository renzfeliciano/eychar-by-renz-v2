import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, LocationModel, ProjectModel } from "@/server/db/models";
import { ClockSiteService } from "@/domains/attendance/clock-site-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";

async function seedOrganization(suffix: string) {
  return OrganizationModel.create({ name: "Acme", slug: `acme-site-${suffix}-${Date.now()}-${Math.random()}` });
}

async function seedSite(organizationId: unknown, overrides: { projectStatus?: string; locationStatus?: string; withCoordinates?: boolean } = {}) {
  const location = await LocationModel.create({
    organizationId,
    name: "Makati Site",
    code: `MKT-${Math.random()}`,
    status: overrides.locationStatus ?? "active",
    ...(overrides.withCoordinates === false ? {} : { latitude: 14.5547, longitude: 121.0244, geofenceRadiusMeters: 150 }),
  });
  const project = await ProjectModel.create({
    organizationId,
    name: "Ayala Tower Fit-out",
    code: `AYALA-${Math.random()}`,
    status: overrides.projectStatus ?? "active",
    locationId: location._id,
  });
  return { location, project };
}

describe("ClockSiteService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  describe("listForOrganization", () => {
    it("lists only active projects whose location is active and has coordinates", async () => {
      const organization = await seedOrganization("1");
      const { project, location } = await seedSite(organization._id);
      await seedSite(organization._id, { projectStatus: "inactive" });
      await seedSite(organization._id, { locationStatus: "inactive" });
      await seedSite(organization._id, { withCoordinates: false });
      await ProjectModel.create({ organizationId: organization._id, name: "No Location", code: `NOLOC-${Math.random()}` });

      const sites = await ClockSiteService.listForOrganization(organization._id.toString());

      expect(sites).toEqual([
        {
          projectId: project._id.toString(),
          projectName: "Ayala Tower Fit-out",
          locationId: location._id.toString(),
          locationName: "Makati Site",
          latitude: 14.5547,
          longitude: 121.0244,
          radiusMeters: 150,
        },
      ]);
    });

    it("never includes another organization's sites", async () => {
      const organization = await seedOrganization("2");
      const otherOrganization = await seedOrganization("2b");
      await seedSite(otherOrganization._id);

      expect(await ClockSiteService.listForOrganization(organization._id.toString())).toEqual([]);
    });
  });

  describe("resolve", () => {
    it("returns the site for an active project with a geofenced location", async () => {
      const organization = await seedOrganization("3");
      const { project } = await seedSite(organization._id);

      const site = await ClockSiteService.resolve(organization._id.toString(), project._id.toString());

      expect(site.projectName).toBe("Ayala Tower Fit-out");
      expect(site.radiusMeters).toBe(150);
    });

    it("rejects a project from another organization as not found", async () => {
      const organization = await seedOrganization("4");
      const otherOrganization = await seedOrganization("4b");
      const { project } = await seedSite(otherOrganization._id);

      await expect(ClockSiteService.resolve(organization._id.toString(), project._id.toString())).rejects.toThrow(NotFoundError);
    });

    it("rejects an inactive project, unless explicitly allowed (clock-out of an already-open day)", async () => {
      const organization = await seedOrganization("5");
      const { project } = await seedSite(organization._id, { projectStatus: "inactive" });

      await expect(ClockSiteService.resolve(organization._id.toString(), project._id.toString())).rejects.toThrow(BusinessRuleError);
      await expect(
        ClockSiteService.resolve(organization._id.toString(), project._id.toString(), { allowInactiveProject: true }),
      ).resolves.toMatchObject({ projectId: project._id.toString() });
    });

    it("rejects a project whose location has no coordinates", async () => {
      const organization = await seedOrganization("6");
      const { project } = await seedSite(organization._id, { withCoordinates: false });

      await expect(ClockSiteService.resolve(organization._id.toString(), project._id.toString())).rejects.toThrow(
        /doesn't have a clock-in site/,
      );
    });

    it("rejects a malformed project id as not found instead of crashing", async () => {
      const organization = await seedOrganization("7");
      await expect(ClockSiteService.resolve(organization._id.toString(), "not-an-id")).rejects.toThrow(NotFoundError);
    });
  });
});
