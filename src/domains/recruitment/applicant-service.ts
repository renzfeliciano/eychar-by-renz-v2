import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { ApplicantModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { RecruitmentStageService } from "@/domains/catalog/recruitment-stage-service";
import { HireService } from "@/domains/workforce/hire-service";
import { JobOpeningService } from "./job-opening-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import type { CreateApplicantInput } from "@/shared/validation/recruitment";

type StageMetadata = { isTerminal?: boolean };

function isTerminal(item: { metadata?: unknown } | null | undefined): boolean {
  return Boolean(item && (item.metadata as StageMetadata | undefined)?.isTerminal);
}

export const ApplicantService = {
  async create(input: CreateApplicantInput, actor: { userId?: string }) {
    await connectMongoDB();

    const opening = await JobOpeningService.getById(input.jobOpeningId, input.organizationId);
    if (opening.status !== "open") {
      throw new BusinessRuleError("This job opening is closed and no longer accepting applicants");
    }
    await RecruitmentStageService.assertValidCode(input.organizationId, "applied");

    const applicant = await ApplicantModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      jobOpeningId: new Types.ObjectId(input.jobOpeningId),
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      stage: "applied",
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "applicant.created",
      resourceType: "Applicant",
      resourceId: applicant._id.toString(),
      after: { jobOpeningId: applicant.jobOpeningId, stage: applicant.stage },
    });

    return applicant;
  },

  /**
   * Forward-only, driven by the org's configured RecruitmentStage
   * sortOrder — never a hardcoded stage array. Permissive (order/terminal
   * checks skipped) only when the catalog itself is unconfigured, matching
   * every other catalog-backed validation in this codebase.
   */
  async advanceStage(id: string, organizationId: string, patch: { stage: string }, actor: { userId?: string }) {
    await connectMongoDB();

    const applicant = await ApplicantModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!applicant) throw new NotFoundError("Applicant not found in this organization");

    await RecruitmentStageService.assertValidCode(organizationId, patch.stage);

    const [currentItem, nextItem] = await Promise.all([
      RecruitmentStageService.getByCode(organizationId, applicant.stage),
      RecruitmentStageService.getByCode(organizationId, patch.stage),
    ]);
    if (currentItem && nextItem) {
      if (isTerminal(currentItem)) throw new BusinessRuleError("This applicant is already in a terminal stage");
      if (isTerminal(nextItem)) throw new BusinessRuleError("Use reject()/hire() to move an applicant into a terminal stage");
      if (nextItem.sortOrder <= currentItem.sortOrder) {
        throw new BusinessRuleError("Applicants can only move forward in the pipeline");
      }
    }

    const before = { stage: applicant.stage };
    applicant.stage = patch.stage;
    await applicant.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "applicant.advanced",
      resourceType: "Applicant",
      resourceId: applicant._id.toString(),
      before,
      after: { stage: applicant.stage },
    });

    return applicant;
  },

  async reject(id: string, organizationId: string, patch: { reason?: string }, actor: { userId?: string }) {
    await connectMongoDB();

    const applicant = await ApplicantModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!applicant) throw new NotFoundError("Applicant not found in this organization");

    const currentItem = await RecruitmentStageService.getByCode(organizationId, applicant.stage);
    if (isTerminal(currentItem)) throw new BusinessRuleError("This applicant is already in a terminal stage");
    await RecruitmentStageService.assertValidCode(organizationId, "rejected");

    const before = { stage: applicant.stage };
    applicant.stage = "rejected";
    applicant.rejectionReason = patch.reason;
    await applicant.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "applicant.rejected",
      resourceType: "Applicant",
      resourceId: applicant._id.toString(),
      before,
      after: { stage: applicant.stage, rejectionReason: applicant.rejectionReason },
    });

    return applicant;
  },

  /**
   * Only from the final non-terminal stage the org has configured (the
   * "offer"-equivalent) — resolved generically from RecruitmentStage
   * sortOrder, not a hardcoded "offer" string, except as the fallback
   * when the catalog itself is unconfigured. Reuses the existing
   * HireService (ADR-015) rather than a second employee-creation path.
   */
  async hire(
    id: string,
    organizationId: string,
    hireInput: {
      employeeNumber: string;
      employmentType: string;
      positionId?: string;
      organizationUnitId?: string;
      projectId?: string;
      locationId?: string;
      reportsToEmployeeId?: string;
      effectiveFrom?: Date;
    },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const applicant = await ApplicantModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!applicant) throw new NotFoundError("Applicant not found in this organization");

    const stages = await RecruitmentStageService.listCurrent(organizationId);
    let qualifies: boolean;
    if (stages.length === 0) {
      qualifies = applicant.stage === "offer";
    } else {
      const nonTerminal = stages.filter((stage) => !isTerminal(stage));
      const maxSortOrder = Math.max(...nonTerminal.map((stage) => stage.sortOrder));
      const currentItem = stages.find((stage) => stage.code === applicant.stage);
      qualifies = Boolean(currentItem) && !isTerminal(currentItem) && currentItem!.sortOrder === maxSortOrder;
    }
    if (!qualifies) {
      throw new BusinessRuleError("Applicants can only be hired from the final pipeline stage before a decision");
    }

    const result = await HireService.hire(
      {
        organizationId,
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        email: applicant.email,
        employeeNumber: hireInput.employeeNumber,
        employmentType: hireInput.employmentType,
        positionId: hireInput.positionId,
        organizationUnitId: hireInput.organizationUnitId,
        projectId: hireInput.projectId,
        locationId: hireInput.locationId,
        reportsToEmployeeId: hireInput.reportsToEmployeeId,
        effectiveFrom: hireInput.effectiveFrom,
      },
      actor,
    );

    await RecruitmentStageService.assertValidCode(organizationId, "hired");

    const before = { stage: applicant.stage };
    applicant.stage = "hired";
    applicant.hiredEmployeeId = result.employee._id;
    await applicant.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "applicant.hired",
      resourceType: "Applicant",
      resourceId: applicant._id.toString(),
      before,
      after: { stage: applicant.stage, hiredEmployeeId: applicant.hiredEmployeeId },
    });

    return applicant;
  },

  async listForJobOpening(jobOpeningId: string, organizationId: string) {
    await connectMongoDB();
    return ApplicantModel.find({
      jobOpeningId: new Types.ObjectId(jobOpeningId),
      organizationId: new Types.ObjectId(organizationId),
    })
      .sort({ appliedAt: -1 })
      .lean();
  },

  async listForOrganization(organizationId: string, filters: { stage?: string } = {}) {
    await connectMongoDB();
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (filters.stage) filter.stage = filters.stage;
    return ApplicantModel.find(filter).sort({ appliedAt: -1 }).lean();
  },
};
