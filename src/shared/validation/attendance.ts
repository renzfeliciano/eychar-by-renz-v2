import { z } from "zod";

export const createAttendancePolicySchema = z.object({
  organizationId: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  standardStartTime: z.string().trim().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  standardEndTime: z.string().trim().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  gracePeriodMinutes: z.coerce.number().int().min(0).default(0),
  workDays: z.array(z.number().int().min(0).max(6)).optional(),
});

export const recordAttendanceSchema = z.object({
  organizationId: z.string().trim().min(1),
  employeeId: z.string().trim().min(1),
  date: z.coerce.date(),
  checkInAt: z.coerce.date().optional(),
  checkOutAt: z.coerce.date().optional(),
  status: z.enum(["present", "late", "absent", "on_leave"]).optional(),
  notes: z.string().trim().optional(),
});

export const adjustAttendanceSchema = z.object({
  organizationId: z.string().trim().min(1),
  checkInAt: z.coerce.date().optional(),
  checkOutAt: z.coerce.date().optional(),
  status: z.enum(["present", "late", "absent", "on_leave"]).optional(),
  notes: z.string().trim().optional(),
});

export type CreateAttendancePolicyInput = z.infer<typeof createAttendancePolicySchema>;
export type RecordAttendanceInput = z.infer<typeof recordAttendanceSchema>;
export type AdjustAttendanceInput = z.infer<typeof adjustAttendanceSchema>;
