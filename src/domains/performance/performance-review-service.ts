import { Types } from "mongoose";
import { connectMongoDB } from "@/server/db/connection";
import { PerformanceReviewModel, EmployeeModel, ReviewCycleModel } from "@/server/db/models";
import { PerformanceRatingService } from "@/domains/catalog/performance-rating-service";
import { isDuplicateKeyError } from "@/server/db/mongo-errors";
import { AuditService } from "@/server/audit/audit-service";
import { BusinessRuleError, ConflictError, NotFoundError } from "@/shared/errors";
import type { CreatePerformanceReviewInput } from "@/shared/validation/performance";

export const PerformanceReviewService = {
  async create(input: CreatePerformanceReviewInput, actor: { userId?: string }) {
    await connectMongoDB();

    const organizationId = new Types.ObjectId(input.organizationId);
    const cycleExists = await ReviewCycleModel.exists({ _id: new Types.ObjectId(input.reviewCycleId), organizationId });
    if (!cycleExists) throw new NotFoundError("Review cycle not found in this organization");

    const employeeExists = await EmployeeModel.exists({ _id: new Types.ObjectId(input.employeeId), organizationId });
    if (!employeeExists) throw new NotFoundError("Employee not found in this organization");
    const reviewerExists = await EmployeeModel.exists({ _id: new Types.ObjectId(input.reviewerId), organizationId });
    if (!reviewerExists) throw new NotFoundError("Reviewer not found in this organization");

    let review;
    try {
      review = await PerformanceReviewModel.create({
        organizationId,
        reviewCycleId: new Types.ObjectId(input.reviewCycleId),
        employeeId: new Types.ObjectId(input.employeeId),
        reviewerId: new Types.ObjectId(input.reviewerId),
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError("This employee already has a review in this cycle");
      }
      throw error;
    }

    await AuditService.record({
      organizationId: input.organizationId,
      actorUserId: actor.userId,
      action: "performance-review.created",
      resourceType: "PerformanceReview",
      resourceId: review._id.toString(),
      after: { reviewCycleId: review.reviewCycleId, employeeId: review.employeeId, reviewerId: review.reviewerId },
    });

    return review;
  },

  /** A review can only be submitted once, and only with a rating configured in the org's catalog. */
  async submit(
    id: string,
    organizationId: string,
    patch: { ratingCode?: string; comments?: string },
    actor: { userId?: string },
  ) {
    await connectMongoDB();

    const review = await PerformanceReviewModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!review) throw new NotFoundError("Performance review not found in this organization");
    if (review.status !== "draft") {
      throw new BusinessRuleError(`Only a draft review can be submitted (current status: ${review.status})`);
    }
    if (!patch.ratingCode) {
      throw new BusinessRuleError("A rating is required to submit a performance review");
    }
    await PerformanceRatingService.assertValidCode(organizationId, patch.ratingCode);

    const before = { status: review.status };
    review.ratingCode = patch.ratingCode;
    review.comments = patch.comments;
    review.status = "submitted";
    review.submittedAt = new Date();
    await review.save();

    await AuditService.record({
      organizationId,
      actorUserId: actor.userId,
      action: "performance-review.submitted",
      resourceType: "PerformanceReview",
      resourceId: review._id.toString(),
      before,
      after: { status: review.status, ratingCode: review.ratingCode },
    });

    return review;
  },

  async listForCycle(reviewCycleId: string, organizationId: string) {
    await connectMongoDB();
    return PerformanceReviewModel.find({
      reviewCycleId: new Types.ObjectId(reviewCycleId),
      organizationId: new Types.ObjectId(organizationId),
    }).lean();
  },

  async listForEmployee(employeeId: string, organizationId: string) {
    await connectMongoDB();
    return PerformanceReviewModel.find({
      employeeId: new Types.ObjectId(employeeId),
      organizationId: new Types.ObjectId(organizationId),
    })
      .sort({ createdAt: -1 })
      .lean();
  },
};
