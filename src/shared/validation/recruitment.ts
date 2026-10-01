import { z } from "zod";
import { contactNumberSchema, emailSchema } from "./shared";
import { objectId } from "@/shared/validation/object-id";

// Same shape for create and update — mirroring the legacy v1 app, where an
// applicant's form dialog is a full edit, not a narrow single-field patch.
export const applicantSchema = z.object({
  organizationId: objectId(),
  positionId: objectId(),
  applicantName: z.string().trim().min(1).max(120),
  email: emailSchema.optional(),
  phone: contactNumberSchema.optional(),
  appliedDate: z.coerce.date(),
  remarks: z.string().trim().max(500).optional(),
});

export const createApplicantSchema = applicantSchema;
export const updateApplicantSchema = applicantSchema;

/** Free-form move to any configured stage — no forward-only/terminal restriction, matching v1's plain "Move to" dropdown. */
export const moveApplicantStageSchema = z.object({
  organizationId: objectId(),
  stage: z.string().trim().min(1),
});

export type CreateApplicantInput = z.infer<typeof createApplicantSchema>;
export type UpdateApplicantInput = z.infer<typeof updateApplicantSchema>;
export type MoveApplicantStageInput = z.infer<typeof moveApplicantStageSchema>;
