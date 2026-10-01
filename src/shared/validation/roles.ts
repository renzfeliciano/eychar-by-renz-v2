import { z } from "zod";
import { objectId } from "@/shared/validation/object-id";

// Same shape for create and update — a role's edit dialog is a full edit
// (name/description/permission set/status), not a narrow patch.
export const roleSchema = z.object({
  organizationId: objectId(),
  name: z.string().max(200).trim().min(1),
  description: z.string().trim().max(255).optional(),
  permissionKeys: z.array(z.string().max(200).trim().min(1)).max(500).default([]),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const createRoleSchema = roleSchema;
export const updateRoleSchema = roleSchema;

export const assignRoleSchema = z.object({
  organizationId: objectId(),
  roleId: objectId(),
  userId: objectId(),
});

export const revokeRoleAssignmentSchema = z.object({
  organizationId: objectId(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
