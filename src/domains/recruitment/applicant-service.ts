import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { ApplicantModel, PositionModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { RecruitmentStageService } from "@/domains/catalog/recruitment-stage-service";
import { NotFoundError } from "@/shared/errors";
import type { CreateApplicantInput, UpdateApplicantInput } from "@/shared/validation/recruitment";

async function assertPositionValid(organizationId: string, positionId: string) {
  const exists = await PositionModel.exists({
    _id: new Types.ObjectId(positionId),
    organizationId: new Types.ObjectId(organizationId),
  });
  if (!exists) throw new NotFoundError("Position not found in this organization");
}

export const ApplicantService = {
  async create(input: CreateApplicantInput, actor: { userId?: string }) {
    await connectMongoDB();
    await assertPositionValid(input.organizationId, input.positionId);
    await RecruitmentStageService.assertValidCode(input.organizationId, "applied");

    const applicant = await ApplicantModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      positionId: new Types.ObjectId(input.positionId),
      applicantName: input.applicantName,
      email: input.email,
      phone: input.phone,
      appliedDate: input.appliedDate,
      remarks: input.remarks,
      stage: "applied",
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "applicant.created",
      resourceType: "Applicant",
      resourceId: applicant._id.toString(),
      after: { positionId: applicant.positionId, stage: applicant.stage },
    });

    return applicant;
  },

  /** A full edit — same shape as create, mirroring the legacy app's single reused form. */
  async update(id: string, organizationId: string, patch: Omit<UpdateApplicantInput, "organizationId">, actor: { userId?: string }) {
    await connectMongoDB();

    const applicant = await ApplicantModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!applicant) throw new NotFoundError("Applicant not found in this organization");

    await assertPositionValid(organizationId, patch.positionId);

    applicant.positionId = new Types.ObjectId(patch.positionId);
    applicant.applicantName = patch.applicantName;
    applicant.email = patch.email;
    applicant.phone = patch.phone;
    applicant.appliedDate = patch.appliedDate;
    applicant.remarks = patch.remarks;
    await applicant.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "applicant.updated",
      resourceType: "Applicant",
      resourceId: applicant._id.toString(),
      after: { positionId: applicant.positionId },
    });

    return applicant;
  },

  /**
   * Free-form move to any configured stage — no forward-only/terminal
   * restriction, matching the legacy v1 app's plain "Move to" dropdown
   * (drag-and-drop or a <select>, both just call this). "Hired"/"Rejected"
   * are ordinary catalog codes here, not special-cased actions.
   */
  async moveStage(id: string, organizationId: string, patch: { stage: string }, actor: { userId?: string }) {
    await connectMongoDB();

    const applicant = await ApplicantModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId) });
    if (!applicant) throw new NotFoundError("Applicant not found in this organization");

    await RecruitmentStageService.assertValidCode(organizationId, patch.stage);

    const before = { stage: applicant.stage };
    applicant.stage = patch.stage;
    await applicant.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "applicant.stage_moved",
      resourceType: "Applicant",
      resourceId: applicant._id.toString(),
      before,
      after: { stage: applicant.stage },
    });

    return applicant;
  },

  async listForOrganization(organizationId: string, filters: { stage?: string } = {}) {
    await connectMongoDB();
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (filters.stage) filter.stage = filters.stage;
    return ApplicantModel.find(filter).sort({ appliedDate: -1 }).lean();
  },
};
