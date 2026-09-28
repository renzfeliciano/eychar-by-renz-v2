import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, LocationModel, ProjectModel, AuditLogModel } from "@/server/db/models";
import { ProjectService } from "@/domains/organization/project-service";
import { ConflictError, NotFoundError } from "@/shared/errors";

describe("ProjectService", () => {
  beforeEach(async () => {
    await connectMongoDB();
    await Promise.all([
      OrganizationModel.deleteMany({}),
      LocationModel.deleteMany({}),
      ProjectModel.deleteMany({}),
    ]);
  });

  it("creates a project and lists it back for the same organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-proj-1" });

    const project = await ProjectService.create(
      { organizationId: organization._id.toString(), name: "Project Alpha", code: "ALPHA" },
      {},
    );

    const projects = await ProjectService.listCurrent(organization._id.toString());
    expect(projects).toHaveLength(1);
    expect(projects[0]._id.toString()).toBe(project._id.toString());
  });

  it("accepts a locationId that belongs to the same organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-proj-2" });
    const location = await LocationModel.create({
      organizationId: organization._id,
      name: "Manila Office",
      code: "MNL",
    });

    const project = await ProjectService.create(
      {
        organizationId: organization._id.toString(),
        locationId: location._id.toString(),
        name: "Project Alpha",
        code: "ALPHA",
      },
      {},
    );

    expect(project.locationId?.toString()).toBe(location._id.toString());
  });

  it("rejects a locationId that belongs to a different organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-proj-3" });
    const otherOrganization = await OrganizationModel.create({ name: "Other", slug: "other-proj-3" });
    const foreignLocation = await LocationModel.create({
      organizationId: otherOrganization._id,
      name: "Other Org Office",
      code: "OTH",
    });

    await expect(
      ProjectService.create(
        {
          organizationId: organization._id.toString(),
          locationId: foreignLocation._id.toString(),
          name: "Project Alpha",
          code: "ALPHA",
        },
        {},
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects a duplicate code within the same organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-proj-4" });
    await ProjectService.create(
      { organizationId: organization._id.toString(), name: "Project Alpha", code: "ALPHA" },
      {},
    );

    await expect(
      ProjectService.create(
        { organizationId: organization._id.toString(), name: "Project Alpha 2", code: "ALPHA" },
        {},
      ),
    ).rejects.toThrow(ConflictError);
  });

  describe("update", () => {
    it("sets a site location on an existing project and audits before/after", async () => {
      const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-proj-5" });
      const location = await LocationModel.create({ organizationId: organization._id, name: "Makati Site", code: "MKT" });
      const project = await ProjectService.create({ organizationId: organization._id.toString(), name: "Project Alpha" }, {});

      const updated = await ProjectService.update(
        project._id.toString(),
        organization._id.toString(),
        { name: "Project Alpha II", description: "Phase two", locationId: location._id.toString() },
        {},
      );

      expect(updated.name).toBe("Project Alpha II");
      expect(updated.description).toBe("Phase two");
      expect(updated.locationId?.toString()).toBe(location._id.toString());
      expect(updated.code).toBe(project.code);

      const audits = await AuditLogModel.find({ resourceId: project._id, action: "project.updated" }).lean();
      expect(audits).toHaveLength(1);
      expect(audits[0].before).toMatchObject({ name: "Project Alpha" });
      expect(audits[0].after).toMatchObject({ name: "Project Alpha II" });
    });

    it("clears the location and description when given empty strings", async () => {
      const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-proj-6" });
      const location = await LocationModel.create({ organizationId: organization._id, name: "Makati Site", code: "MKT" });
      const project = await ProjectService.create(
        { organizationId: organization._id.toString(), name: "Project Alpha", description: "Old", locationId: location._id.toString() },
        {},
      );

      const updated = await ProjectService.update(project._id.toString(), organization._id.toString(), { locationId: "", description: "" }, {});

      expect(updated.locationId).toBeUndefined();
      expect(updated.description).toBeUndefined();
    });

    it("rejects a location from another organization", async () => {
      const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-proj-7" });
      const otherOrganization = await OrganizationModel.create({ name: "Other", slug: "other-proj-7" });
      const foreignLocation = await LocationModel.create({ organizationId: otherOrganization._id, name: "Other Site", code: "OTH" });
      const project = await ProjectService.create({ organizationId: organization._id.toString(), name: "Project Alpha" }, {});

      await expect(
        ProjectService.update(project._id.toString(), organization._id.toString(), { locationId: foreignLocation._id.toString() }, {}),
      ).rejects.toThrow(NotFoundError);
    });

    it("treats a malformed project id as not found instead of crashing", async () => {
      const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-proj-9" });
      await expect(ProjectService.update("not-an-id", organization._id.toString(), { name: "X" }, {})).rejects.toThrow(NotFoundError);
    });

    it("rejects editing a project from another organization", async () => {
      const organization = await OrganizationModel.create({ name: "Acme", slug: "acme-proj-8" });
      const otherOrganization = await OrganizationModel.create({ name: "Other", slug: "other-proj-8" });
      const project = await ProjectService.create({ organizationId: organization._id.toString(), name: "Project Alpha" }, {});

      await expect(
        ProjectService.update(project._id.toString(), otherOrganization._id.toString(), { name: "Hijacked" }, {}),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
