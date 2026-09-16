import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PositionModel, AuditLogModel } from "@/server/db/models";
import { JobOpeningService } from "@/domains/recruitment/job-opening-service";
import { NotFoundError } from "@/shared/errors";

async function seedOrgAndPosition(suffix: string) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-jo-${suffix}-${Date.now()}-${Math.random()}` });
  const position = await PositionModel.create({ organizationId: organization._id, title: "Engineer", code: `ENG-${suffix}-${Date.now()}` });
  return { organization, position };
}

describe("JobOpeningService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates a job opening for a position in the same organization", async () => {
    const { organization, position } = await seedOrgAndPosition("1");

    const opening = await JobOpeningService.create(
      { organizationId: organization._id.toString(), positionId: position._id.toString() },
      {},
    );

    expect(opening.status).toBe("open");
    expect(opening.headcount).toBe(1);

    const openings = await JobOpeningService.listCurrent(organization._id.toString());
    expect(openings).toHaveLength(1);
  });

  it("rejects a positionId from a different organization", async () => {
    const { organization } = await seedOrgAndPosition("2");
    const { position: foreignPosition } = await seedOrgAndPosition("2-other");

    await expect(
      JobOpeningService.create(
        { organizationId: organization._id.toString(), positionId: foreignPosition._id.toString() },
        {},
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("updateStatus closes a posting and audits it", async () => {
    const { organization, position } = await seedOrgAndPosition("3");
    const opening = await JobOpeningService.create(
      { organizationId: organization._id.toString(), positionId: position._id.toString() },
      {},
    );

    const closed = await JobOpeningService.updateStatus(opening._id.toString(), organization._id.toString(), { status: "closed" }, {});

    expect(closed.status).toBe("closed");
    const audits = await AuditLogModel.find({ resourceId: opening._id, action: "job-opening.updated" }).lean();
    expect(audits).toHaveLength(1);
  });
});
