import { z } from "zod";

export const createOrganizationUnitSchema = z.object({
  organizationId: z.string().trim().min(1),
  parentUnitId: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1),
  name: z.string().trim().min(1),
  code: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

export const createPositionSchema = z.object({
  organizationId: z.string().trim().min(1),
  organizationUnitId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  code: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

export const createLocationSchema = z.object({
  organizationId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  code: z.string().trim().min(1),
  address: z.string().trim().optional(),
});

export const createProjectSchema = z.object({
  organizationId: z.string().trim().min(1),
  locationId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  code: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

export const updateOrganizationEntityStatusSchema = z.object({
  organizationId: z.string().trim().min(1),
  status: z.enum(["active", "inactive"]).optional(),
  effectiveTo: z.coerce.date().optional(),
});

export type CreateOrganizationUnitInput = z.infer<typeof createOrganizationUnitSchema>;
export type CreatePositionInput = z.infer<typeof createPositionSchema>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateOrganizationEntityStatusInput = z.infer<typeof updateOrganizationEntityStatusSchema>;
