import { z } from "zod";
import { objectId } from "@/shared/validation/object-id";

const typedName = z.string().max(200).trim().min(1, "Type your full name to confirm");

export const createPerformanceEvaluationSchema = z.object({
  organizationId: objectId(),
  employeeId: objectId(),
  evaluatorId: objectId(),
  evaluationFor: z.string().max(200).trim().min(1, "Choose what the evaluation is for"),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
});

export const savePerformanceEvaluationSchema = z.object({
  organizationId: objectId(),
  evaluationFor: z.string().max(200).trim().min(1).optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  ratings: z.array(z.object({ criterionKey: z.string().max(100), rating: z.enum(["S", "A", "NI"]) })).max(100).optional(),
  goals: z.string().max(4000).trim().optional(),
  evaluatorComments: z.string().max(4000).trim().optional(),
});

export const submitPerformanceEvaluationSchema = z.object({
  organizationId: objectId(),
  typedName,
});

export const acknowledgePerformanceEvaluationSchema = z.object({
  organizationId: objectId(),
  typedName,
  comments: z.string().max(4000).trim().optional(),
});

export type CreatePerformanceEvaluationInput = z.infer<typeof createPerformanceEvaluationSchema>;
export type SavePerformanceEvaluationInput = z.infer<typeof savePerformanceEvaluationSchema>;
export type SubmitPerformanceEvaluationInput = z.infer<typeof submitPerformanceEvaluationSchema>;
export type AcknowledgePerformanceEvaluationInput = z.infer<typeof acknowledgePerformanceEvaluationSchema>;
