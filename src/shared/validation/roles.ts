import { z } from "zod";

// Same shape for create and update — a role's edit dialog is a full edit
// (name/description/permission set/status), not a narrow patch.
export const roleSchema = z.object({
  organizationId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().max(255).optional(),
  permissionKeys: z.array(z.string().trim().min(1)).default([]),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const createRoleSchema = roleSchema;
export const updateRoleSchema = roleSchema;

export const assignRoleSchema = z.object({
  organizationId: z.string().trim().min(1),
  roleId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
});

export const revokeRoleAssignmentSchema = z.object({
  organizationId: z.string().trim().min(1),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
