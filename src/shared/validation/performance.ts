import { z } from "zod";
import { objectId } from "@/shared/validation/object-id";

export const createReviewCycleSchema = z.object({
  organizationId: objectId(),
  name: z.string().trim().min(1),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
});

export const updateReviewCycleStatusSchema = z.object({
  organizationId: objectId(),
  status: z.enum(["draft", "open", "closed"]),
});

export const createPerformanceReviewSchema = z.object({
  organizationId: objectId(),
  reviewCycleId: objectId(),
  employeeId: objectId(),
  reviewerId: objectId(),
});

export const submitPerformanceReviewSchema = z.object({
  organizationId: objectId(),
  ratingCode: z.string().trim().min(1).optional(),
  comments: z.string().trim().optional(),
});

export type CreateReviewCycleInput = z.infer<typeof createReviewCycleSchema>;
export type UpdateReviewCycleStatusInput = z.infer<typeof updateReviewCycleStatusSchema>;
export type CreatePerformanceReviewInput = z.infer<typeof createPerformanceReviewSchema>;
export type SubmitPerformanceReviewInput = z.infer<typeof submitPerformanceReviewSchema>;
