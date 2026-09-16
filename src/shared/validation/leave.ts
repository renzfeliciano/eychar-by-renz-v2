import { z } from "zod";

export const createLeaveTypeSchema = z.object({
  organizationId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  code: z.string().trim().min(1),
  description: z.string().trim().optional(),
  requiresApproval: z.coerce.boolean().optional(),
});

export const createLeavePolicySchema = z.object({
  organizationId: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
  leaveTypeId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  annualEntitlementDays: z.coerce.number().min(0),
});

export const updateLeaveTypeStatusSchema = z.object({
  organizationId: z.string().trim().min(1),
  status: z.enum(["active", "inactive"]),
});

export const updateLeavePolicyStatusSchema = z.object({
  organizationId: z.string().trim().min(1),
  status: z.enum(["active", "inactive"]).optional(),
  effectiveTo: z.coerce.date().optional(),
});

export const createLeaveBalanceSchema = z.object({
  organizationId: z.string().trim().min(1),
  employeeId: z.string().trim().min(1),
  leaveTypeId: z.string().trim().min(1),
  year: z.coerce.number().int(),
  entitledDays: z.coerce.number().min(0),
});

export const adjustLeaveBalanceSchema = z.object({
  organizationId: z.string().trim().min(1),
  adjustmentDays: z.coerce.number(),
});

export const createLeaveRequestSchema = z.object({
  organizationId: z.string().trim().min(1),
  employeeId: z.string().trim().min(1),
  leaveTypeId: z.string().trim().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().trim().optional(),
});

export const decideLeaveRequestSchema = z.object({
  organizationId: z.string().trim().min(1),
  action: z.enum(["approve", "reject", "cancel"]),
  rejectionReason: z.string().trim().optional(),
});

export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;
export type UpdateLeaveTypeStatusInput = z.infer<typeof updateLeaveTypeStatusSchema>;
export type CreateLeavePolicyInput = z.infer<typeof createLeavePolicySchema>;
export type UpdateLeavePolicyStatusInput = z.infer<typeof updateLeavePolicyStatusSchema>;
export type CreateLeaveBalanceInput = z.infer<typeof createLeaveBalanceSchema>;
export type AdjustLeaveBalanceInput = z.infer<typeof adjustLeaveBalanceSchema>;
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type DecideLeaveRequestInput = z.infer<typeof decideLeaveRequestSchema>;
