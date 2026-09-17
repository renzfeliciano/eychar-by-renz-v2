import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PositionModel } from "@/server/db/models";
import { ApplicantService } from "@/domains/recruitment/applicant-service";
import { RecruitmentStageService } from "@/domains/catalog/recruitment-stage-service";

async function seedPosition(organizationId: object, suffix: string) {
  return PositionModel.create({ organizationId, title: `Position ${suffix}`, code: `POS-${suffix}-${Date.now()}-${Math.random()}` });
}

describe("ApplicantService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates an applicant in the applied stage, linked directly to a position", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-app-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const position = await seedPosition(organization._id, "A");

    const applicant = await ApplicantService.create(
      { organizationId: orgId, positionId: position._id.toString(), applicantName: "Juan Dela Cruz", appliedDate: new Date("2026-01-01") },
      {},
    );

    expect(applicant.stage).toBe("applied");
    expect(applicant.applicantName).toBe("Juan Dela Cruz");
    expect(applicant.positionId.toString()).toBe(position._id.toString());
  });

  it("rejects a position that doesn't belong to the organization", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-app-badpos-${Date.now()}-${Math.random()}` });
    const otherOrg = await OrganizationModel.create({ name: "Other", slug: `other-app-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const foreignPosition = await seedPosition(otherOrg._id, "FOREIGN");

    await expect(
      ApplicantService.create(
        { organizationId: orgId, positionId: foreignPosition._id.toString(), applicantName: "Juan", appliedDate: new Date() },
        {},
      ),
    ).rejects.toThrow();
  });

  it("moves an applicant to any configured stage, in any direction, with no forward-only restriction", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-app-move-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const position = await seedPosition(organization._id, "B");
    await RecruitmentStageService.create({ organizationId: orgId, code: "applied", name: "Applied", sortOrder: 0 }, {});
    await RecruitmentStageService.create({ organizationId: orgId, code: "interview", name: "Interview", sortOrder: 1 }, {});
    await RecruitmentStageService.create({ organizationId: orgId, code: "hired", name: "Hired", sortOrder: 2 }, {});
    await RecruitmentStageService.create({ organizationId: orgId, code: "rejected", name: "Rejected", sortOrder: 3 }, {});

    const applicant = await ApplicantService.create(
      { organizationId: orgId, positionId: position._id.toString(), applicantName: "Juan", appliedDate: new Date() },
      {},
    );

    const advanced = await ApplicantService.moveStage(applicant._id.toString(), orgId, { stage: "hired" }, {});
    expect(advanced.stage).toBe("hired");

    // Moving "backward" is allowed — no forward-only state machine, matching v1.
    const movedBack = await ApplicantService.moveStage(applicant._id.toString(), orgId, { stage: "applied" }, {});
    expect(movedBack.stage).toBe("applied");

    const rejected = await ApplicantService.moveStage(applicant._id.toString(), orgId, { stage: "rejected" }, {});
    expect(rejected.stage).toBe("rejected");
  });

  it("rejects a move to a stage not configured in the org's catalog once one exists", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-app-badstage-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const position = await seedPosition(organization._id, "C");
    await RecruitmentStageService.create({ organizationId: orgId, code: "applied", name: "Applied", sortOrder: 0 }, {});

    const applicant = await ApplicantService.create(
      { organizationId: orgId, positionId: position._id.toString(), applicantName: "Juan", appliedDate: new Date() },
      {},
    );

    await expect(ApplicantService.moveStage(applicant._id.toString(), orgId, { stage: "not-a-real-stage" }, {})).rejects.toThrow();
  });

  it("fully updates an applicant's fields", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-app-update-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const position = await seedPosition(organization._id, "D");
    const applicant = await ApplicantService.create(
      { organizationId: orgId, positionId: position._id.toString(), applicantName: "Juan", appliedDate: new Date("2026-01-01") },
      {},
    );

    const updated = await ApplicantService.update(
      applicant._id.toString(),
      orgId,
      { positionId: position._id.toString(), applicantName: "Juan Dela Cruz", appliedDate: new Date("2026-02-01"), remarks: "Strong candidate" },
      {},
    );

    expect(updated.applicantName).toBe("Juan Dela Cruz");
    expect(updated.remarks).toBe("Strong candidate");
  });

  it("lists applicants for an organization, most recently applied first", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-app-list-${Date.now()}-${Math.random()}` });
    const orgId = organization._id.toString();
    const position = await seedPosition(organization._id, "E");
    await ApplicantService.create(
      { organizationId: orgId, positionId: position._id.toString(), applicantName: "A", appliedDate: new Date("2026-01-01") },
      {},
    );
    await ApplicantService.create(
      { organizationId: orgId, positionId: position._id.toString(), applicantName: "B", appliedDate: new Date("2026-02-01") },
      {},
    );

    const applicants = await ApplicantService.listForOrganization(orgId);
    expect(applicants.map((applicant) => applicant.applicantName)).toEqual(["B", "A"]);
  });
});
