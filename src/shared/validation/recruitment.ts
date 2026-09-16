import { z } from "zod";

export const createJobOpeningSchema = z.object({
  organizationId: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
  positionId: z.string().trim().min(1),
  headcount: z.coerce.number().int().min(1).optional(),
});

export const updateJobOpeningStatusSchema = z.object({
  organizationId: z.string().trim().min(1),
  status: z.enum(["open", "closed"]),
});

export const createApplicantSchema = z.object({
  organizationId: z.string().trim().min(1),
  jobOpeningId: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().optional(),
});

const assignmentFields = {
  positionId: z.string().trim().min(1).optional(),
  organizationUnitId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  locationId: z.string().trim().min(1).optional(),
  reportsToEmployeeId: z.string().trim().min(1).optional(),
  effectiveFrom: z.coerce.date().optional(),
};

export const decideApplicantSchema = z.discriminatedUnion("action", [
  z.object({ organizationId: z.string().trim().min(1), action: z.literal("advance"), stage: z.string().trim().min(1) }),
  z.object({ organizationId: z.string().trim().min(1), action: z.literal("reject"), reason: z.string().trim().optional() }),
  z.object({
    organizationId: z.string().trim().min(1),
    action: z.literal("hire"),
    employeeNumber: z.string().trim().min(1),
    employmentType: z.string().trim().min(1),
    ...assignmentFields,
  }),
]);

export type CreateJobOpeningInput = z.infer<typeof createJobOpeningSchema>;
export type UpdateJobOpeningStatusInput = z.infer<typeof updateJobOpeningStatusSchema>;
export type CreateApplicantInput = z.infer<typeof createApplicantSchema>;
export type DecideApplicantInput = z.infer<typeof decideApplicantSchema>;
