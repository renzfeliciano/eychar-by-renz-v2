import { z } from "zod";
import { objectId } from "@/shared/validation/object-id";

// Same shape for create and update — mirroring the legacy v1 app, where a
// case's form dialog is a full edit, not a narrow status-only patch.
export const caseSchema = z.object({
  organizationId: objectId(),
  projectId: objectId(),
  caseName: z.string().max(200).trim().min(1),
  caseNumber: z.string().max(200).trim().min(1),
  classification: z.string().max(200).trim().min(1),
  status: z.string().max(200).trim().min(1),
  legalCounsel: z.string().max(200).trim().optional(),
  briefHistory: z.string().max(2000).trim().optional(),
});

export const createCaseSchema = caseSchema;
export const updateCaseSchema = caseSchema;

export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
