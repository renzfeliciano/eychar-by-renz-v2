import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { ReviewCycleModel } from "@/server/db/models";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, NotFoundError } from "@/shared/errors";
import type { CreateReviewCycleInput } from "@/shared/validation/performance";

// draft -> open -> closed only — an extra draft stage before open/closed so
// HR can set up a cycle (dates, name) before reviewers can start
// submitting reviews against it.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["open"],
  open: ["closed"],
  closed: [],
};

export const ReviewCycleService = {
  async create(input: CreateReviewCycleInput, actor: { userId?: string }) {
    await connectMongoDB();

    if (input.periodEnd.getTime() < input.periodStart.getTime()) {
      throw new BusinessRuleError("periodEnd must be on or after periodStart");
    }

    const cycle = await ReviewCycleModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      name: input.name,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "review-cycle.created",
      resourceType: "ReviewCycle",
      resourceId: cycle._id.toString(),
      after: { name: cycle.name, periodStart: cycle.periodStart, periodEnd: cycle.periodEnd },
    });

    return cycle;
  },

  async updateStatus(id: string, organizationId: string, patch: { status: "draft" | "open" | "closed" }, actor: { userId?: string }) {
    await connectMongoDB();

    const cycle = await ReviewCycleModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!cycle) throw new NotFoundError("Review cycle not found in this organization");

    if (!ALLOWED_TRANSITIONS[cycle.status]?.includes(patch.status)) {
      throw new BusinessRuleError(`Cannot move a ${cycle.status} review cycle to ${patch.status}`);
    }

    const before = { status: cycle.status };
    cycle.status = patch.status;
    await cycle.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "review-cycle.updated",
      resourceType: "ReviewCycle",
      resourceId: cycle._id.toString(),
      before,
      after: { status: cycle.status },
    });

    return cycle;
  },

  async listCurrent(organizationId: string) {
    await connectMongoDB();
    return ReviewCycleModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ periodStart: -1 }).lean();
  },

  async getById(id: string, organizationId: string) {
    await connectMongoDB();
    const cycle = await ReviewCycleModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    }).lean();
    if (!cycle) throw new NotFoundError("Review cycle not found in this organization");
    return cycle;
  },
};
