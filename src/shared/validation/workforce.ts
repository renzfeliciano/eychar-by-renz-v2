import { z } from "zod";
import { clearable, contactNumberSchema, sssNumberSchema, philHealthNumberSchema, pagIbigNumberSchema, tinNumberSchema } from "./shared";

const assignmentFields = {
  positionId: z.string().trim().min(1).optional(),
  organizationUnitId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  locationId: z.string().trim().min(1).optional(),
  // "" removes the manager on transfer.
  reportsToEmployeeId: z.string().trim().optional(),
  effectiveFrom: z.coerce.date().optional(),
};

export const hireEmployeeSchema = z.object({
  organizationId: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  middleName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email().optional(),
  employeeNumber: z.string().trim().min(1).optional(),
  employmentType: z.string().trim().min(1),
  gender: z.enum(["Male", "Female"]).optional(),
  birthDate: z.coerce.date().optional(),
  phone: contactNumberSchema.optional(),
  address: z.string().trim().max(255).optional(),
  sssNumber: sssNumberSchema.optional(),
  philHealthNumber: philHealthNumberSchema.optional(),
  pagIbigNumber: pagIbigNumberSchema.optional(),
  tinNumber: tinNumberSchema.optional(),
  endOfContract: z.coerce.date().optional(),
  ...assignmentFields,
});

// Every field here is always submitted by the edit form (pre-filled with
// the employee's current values), so an empty string is a meaningful
// signal — "clear this field" — not just "not provided." `clearable(...)`
// accepts it alongside the normal format, and the API route/service turn
// it into an actual $unset rather than silently keeping the old value.
export const updateEmployeeProfileSchema = z.object({
  organizationId: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  middleName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().min(1),
  email: clearable(z.string().trim().toLowerCase().email()).optional(),
  employeeNumber: clearable(z.string().trim().min(1)).optional(),
  gender: clearable(z.enum(["Male", "Female"])).optional(),
  birthDate: clearable(z.coerce.date()).optional(),
  phone: clearable(contactNumberSchema).optional(),
  address: z.string().trim().max(255).optional(),
  sssNumber: clearable(sssNumberSchema).optional(),
  philHealthNumber: clearable(philHealthNumberSchema).optional(),
  pagIbigNumber: clearable(pagIbigNumberSchema).optional(),
  tinNumber: clearable(tinNumberSchema).optional(),
});

export const transferAssignmentSchema = z.object({
  organizationId: z.string().trim().min(1),
  ...assignmentFields,
});

export const createEmploymentSchema = z.object({
  organizationId: z.string().trim().min(1),
  employmentType: z.string().trim().min(1),
  effectiveFrom: z.coerce.date().optional(),
});

export const terminateEmploymentSchema = z.object({
  organizationId: z.string().trim().min(1),
  effectiveTo: z.coerce.date().optional(),
  terminationReason: z.string().trim().optional(),
  status: z.string().trim().optional(),
});

export type HireEmployeeInput = z.infer<typeof hireEmployeeSchema>;
export type UpdateEmployeeProfileInput = z.infer<typeof updateEmployeeProfileSchema>;
export type TransferAssignmentInput = z.infer<typeof transferAssignmentSchema>;
export type CreateEmploymentInput = z.infer<typeof createEmploymentSchema>;
export type TerminateEmploymentInput = z.infer<typeof terminateEmploymentSchema>;
