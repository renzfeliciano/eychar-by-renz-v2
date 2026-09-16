import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, LocationModel, ProjectModel } from "@/server/db/models";
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
});
