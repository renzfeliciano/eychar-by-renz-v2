import { z } from "zod";
import { contactNumberSchema, sssNumberSchema, philHealthNumberSchema, pagIbigNumberSchema, tinNumberSchema } from "./shared";

const assignmentFields = {
  positionId: z.string().trim().min(1).optional(),
  organizationUnitId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  locationId: z.string().trim().min(1).optional(),
  reportsToEmployeeId: z.string().trim().min(1).optional(),
  effectiveFrom: z.coerce.date().optional(),
};

export const hireEmployeeSchema = z.object({
  organizationId: z.string().trim().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email().optional(),
  employeeNumber: z.string().trim().min(1),
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
export type TransferAssignmentInput = z.infer<typeof transferAssignmentSchema>;
export type CreateEmploymentInput = z.infer<typeof createEmploymentSchema>;
export type TerminateEmploymentInput = z.infer<typeof terminateEmploymentSchema>;
