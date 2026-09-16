import { describe, it, expect, beforeEach } from "vitest";
import { connectMongoDB } from "@/server/db/connection";
import { OrganizationModel, PositionModel, EmployeeModel, AuditLogModel } from "@/server/db/models";
import { JobOpeningService } from "@/domains/recruitment/job-opening-service";
import { ApplicantService } from "@/domains/recruitment/applicant-service";
import { RecruitmentStageService } from "@/domains/catalog/recruitment-stage-service";
import { BusinessRuleError } from "@/shared/errors";

async function seedStages(organizationId: string) {
  const stages = [
    { code: "applied", name: "Applied", sortOrder: 0 },
    { code: "screening", name: "Screening", sortOrder: 1 },
    { code: "interview", name: "Interview", sortOrder: 2 },
    { code: "offer", name: "Offer", sortOrder: 3 },
    { code: "hired", name: "Hired", sortOrder: 4, metadata: { isTerminal: true } },
    { code: "rejected", name: "Rejected", sortOrder: 5, metadata: { isTerminal: true } },
  ];
  for (const stage of stages) {
    await RecruitmentStageService.create({ organizationId, ...stage }, {});
  }
}

async function seedOrgOpeningAndApplicant(suffix: string, withStages: boolean) {
  const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-app-${suffix}-${Date.now()}-${Math.random()}` });
  if (withStages) await seedStages(organization._id.toString());
  const position = await PositionModel.create({ organizationId: organization._id, title: "Engineer", code: `ENG-${suffix}-${Date.now()}` });
  const opening = await JobOpeningService.create(
    { organizationId: organization._id.toString(), positionId: position._id.toString() },
    {},
  );
  const applicant = await ApplicantService.create(
    { organizationId: organization._id.toString(), jobOpeningId: opening._id.toString(), firstName: "Jane", lastName: "Doe" },
    {},
  );
  return { organization, position, opening, applicant };
}

describe("ApplicantService", () => {
  beforeEach(async () => {
    await connectMongoDB();
  });

  it("creates an applicant in the applied stage", async () => {
    const { applicant } = await seedOrgOpeningAndApplicant("1", true);
    expect(applicant.stage).toBe("applied");
  });

  it("rejects applying to a closed job opening", async () => {
    const organization = await OrganizationModel.create({ name: "Acme", slug: `acme-app-2-${Date.now()}` });
    await seedStages(organization._id.toString());
    const position = await PositionModel.create({ organizationId: organization._id, title: "Engineer", code: `ENG-2-${Date.now()}` });
    const opening = await JobOpeningService.create(
      { organizationId: organization._id.toString(), positionId: position._id.toString() },
      {},
    );
    await JobOpeningService.updateStatus(opening._id.toString(), organization._id.toString(), { status: "closed" }, {});

    await expect(
      ApplicantService.create(
        { organizationId: organization._id.toString(), jobOpeningId: opening._id.toString(), firstName: "Jane", lastName: "Doe" },
        {},
      ),
    ).rejects.toThrow(BusinessRuleError);
  });

  describe("advanceStage", () => {
    it("allows a forward move, including skipping a stage", async () => {
      const { organization, applicant } = await seedOrgOpeningAndApplicant("3", true);

      const advanced = await ApplicantService.advanceStage(applicant._id.toString(), organization._id.toString(), { stage: "interview" }, {});

      expect(advanced.stage).toBe("interview");
    });

    it("rejects moving backward", async () => {
      const { organization, applicant } = await seedOrgOpeningAndApplicant("4", true);
      await ApplicantService.advanceStage(applicant._id.toString(), organization._id.toString(), { stage: "interview" }, {});

      await expect(
        ApplicantService.advanceStage(applicant._id.toString(), organization._id.toString(), { stage: "screening" }, {}),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("rejects moving to the same stage", async () => {
      const { organization, applicant } = await seedOrgOpeningAndApplicant("5", true);

      await expect(
        ApplicantService.advanceStage(applicant._id.toString(), organization._id.toString(), { stage: "applied" }, {}),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("rejects moving into a terminal stage via advanceStage", async () => {
      const { organization, applicant } = await seedOrgOpeningAndApplicant("6", true);

      await expect(
        ApplicantService.advanceStage(applicant._id.toString(), organization._id.toString(), { stage: "hired" }, {}),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe("reject", () => {
    it("rejects a non-terminal applicant and audits it", async () => {
      const { organization, applicant } = await seedOrgOpeningAndApplicant("7", true);

      const rejected = await ApplicantService.reject(applicant._id.toString(), organization._id.toString(), { reason: "Not a fit" }, {});

      expect(rejected.stage).toBe("rejected");
      expect(rejected.rejectionReason).toBe("Not a fit");
      const audits = await AuditLogModel.find({ resourceId: applicant._id, action: "applicant.rejected" }).lean();
      expect(audits).toHaveLength(1);
    });

    it("rejects rejecting an already-terminal applicant", async () => {
      const { organization, applicant } = await seedOrgOpeningAndApplicant("8", true);
      await ApplicantService.reject(applicant._id.toString(), organization._id.toString(), {}, {});

      await expect(ApplicantService.reject(applicant._id.toString(), organization._id.toString(), {}, {})).rejects.toThrow(
        BusinessRuleError,
      );
    });
  });

  describe("hire", () => {
    it("only hires from the final pre-terminal stage, and creates a real Employee", async () => {
      const { organization, applicant, position } = await seedOrgOpeningAndApplicant("9", true);

      await expect(
        ApplicantService.hire(applicant._id.toString(), organization._id.toString(), { employeeNumber: "EMP-9", employmentType: "regular" }, {}),
      ).rejects.toThrow(BusinessRuleError);

      await ApplicantService.advanceStage(applicant._id.toString(), organization._id.toString(), { stage: "offer" }, {});
      const hired = await ApplicantService.hire(
        applicant._id.toString(),
        organization._id.toString(),
        { employeeNumber: "EMP-9", employmentType: "regular", positionId: position._id.toString() },
        { userId: undefined },
      );

      expect(hired.stage).toBe("hired");
      expect(hired.hiredEmployeeId).toBeTruthy();
      const employee = await EmployeeModel.findById(hired.hiredEmployeeId).lean();
      expect(employee?.employeeNumber).toBe("EMP-9");

      const audits = await AuditLogModel.find({ resourceId: applicant._id, action: "applicant.hired" }).lean();
      expect(audits).toHaveLength(1);
    });
  });
});
