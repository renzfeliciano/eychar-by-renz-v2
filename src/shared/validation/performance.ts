import { z } from "zod";

export const createReviewCycleSchema = z.object({
  organizationId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
});

export const updateReviewCycleStatusSchema = z.object({
  organizationId: z.string().trim().min(1),
  status: z.enum(["draft", "open", "closed"]),
});

export const createPerformanceReviewSchema = z.object({
  organizationId: z.string().trim().min(1),
  reviewCycleId: z.string().trim().min(1),
  employeeId: z.string().trim().min(1),
  reviewerId: z.string().trim().min(1),
});

export const submitPerformanceReviewSchema = z.object({
  organizationId: z.string().trim().min(1),
  ratingCode: z.string().trim().min(1).optional(),
  comments: z.string().trim().optional(),
});

export type CreateReviewCycleInput = z.infer<typeof createReviewCycleSchema>;
export type UpdateReviewCycleStatusInput = z.infer<typeof updateReviewCycleStatusSchema>;
export type CreatePerformanceReviewInput = z.infer<typeof createPerformanceReviewSchema>;
export type SubmitPerformanceReviewInput = z.infer<typeof submitPerformanceReviewSchema>;
