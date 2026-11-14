import { z } from "zod";
import { objectId } from "@/shared/validation/object-id";

/** The project select sends "" for "none"; that and null mean no project. */
const optionalObjectId = z.preprocess((value) => (value === "" || value === null ? undefined : value), objectId().optional());

/** Optional trimmed text; a blank value means "none" and is stored as absent. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || undefined)
    .optional();

const optionalDate = z.preprocess((value) => (value === "" || value === null ? undefined : value), z.coerce.date().optional());

// Same shape for create and update, like Recruitment's applicant form: the dialog is a full edit.
// Only the respondent and the date received are required; the incident details are filled in as known.
export const complaintSchema = z.object({
  organizationId: objectId(),
  employeeId: objectId(),
  receivedDate: z.coerce.date(),
  projectId: optionalObjectId,
  description: optionalText(1000),
  what: optionalText(1000),
  where: optionalText(300),
  incidentDate: optionalDate,
  complainantName: optionalText(200),
  remarks: optionalText(1000),
});

export const createComplaintSchema = complaintSchema;
export const updateComplaintSchema = complaintSchema;

/**
 * Free-form move to any configured stage, in any direction. `details` is that stage's
 * section, saved in the same step; its fields are checked by the service against the stage.
 */
export const moveComplaintStageSchema = z.object({
  organizationId: objectId(),
  stage: z.string().max(200).trim().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});

/** Saves (replaces) one stage's details section. */
export const saveComplaintStageDetailsSchema = z.object({
  organizationId: objectId(),
  stage: z.string().max(200).trim().min(1),
  details: z.record(z.string(), z.unknown()),
});

export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;
export type UpdateComplaintInput = z.infer<typeof updateComplaintSchema>;
export type MoveComplaintStageInput = z.infer<typeof moveComplaintStageSchema>;
export type SaveComplaintStageDetailsInput = z.infer<typeof saveComplaintStageDetailsSchema>;
