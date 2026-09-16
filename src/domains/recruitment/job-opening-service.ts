import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { JobOpeningModel, PositionModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { NotFoundError } from "@/shared/errors";
import type { CreateJobOpeningInput } from "@/shared/validation/recruitment";

export const JobOpeningService = {
  async create(input: CreateJobOpeningInput, actor: { userId?: string }) {
    await connectMongoDB();

    const organizationId = new Types.ObjectId(input.organizationId);
    const positionExists = await PositionModel.exists({ _id: new Types.ObjectId(input.positionId), organizationId });
    if (!positionExists) throw new NotFoundError("Position not found in this organization");

    const opening = await JobOpeningModel.create({
      organizationId,
      projectId: input.projectId ? new Types.ObjectId(input.projectId) : undefined,
      positionId: new Types.ObjectId(input.positionId),
      headcount: input.headcount ?? 1,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "job-opening.created",
      resourceType: "JobOpening",
      resourceId: opening._id.toString(),
      after: { positionId: opening.positionId, headcount: opening.headcount },
    });

    return opening;
  },

  async updateStatus(id: string, organizationId: string, patch: { status: "open" | "closed" }, actor: { userId?: string }) {
    await connectMongoDB();

    const opening = await JobOpeningModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!opening) throw new NotFoundError("Job opening not found in this organization");

    const before = { status: opening.status };
    opening.status = patch.status;
    if (patch.status === "closed") opening.closedAt = new Date();
    await opening.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "job-opening.updated",
      resourceType: "JobOpening",
      resourceId: opening._id.toString(),
      before,
      after: { status: opening.status },
    });

    return opening;
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return JobOpeningModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ openedAt: -1 }).lean();
  },

  async getById(id: string, organizationId: string) {
    await connectMongoDB();
    const opening = await JobOpeningModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    }).lean();
    if (!opening) throw new NotFoundError("Job opening not found in this organization");
    return opening;
  },
};
