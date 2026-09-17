import { z } from "zod";

// Same shape for create and update — mirroring the legacy v1 app, where a
// case's form dialog is a full edit, not a narrow status-only patch.
export const caseSchema = z.object({
  organizationId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  caseName: z.string().trim().min(1),
  caseNumber: z.string().trim().min(1),
  classification: z.string().trim().min(1),
  status: z.string().trim().min(1),
  legalCounsel: z.string().trim().optional(),
  briefHistory: z.string().trim().optional(),
});

export const createCaseSchema = caseSchema;
export const updateCaseSchema = caseSchema;

export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
