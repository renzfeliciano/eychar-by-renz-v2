import { z } from "zod";
import { objectIdSchema } from "./shared";
import { calendarDateSchema } from "./schedule";
import { CLEARANCE_AUTO_SOURCES } from "@/domains/clearance/clearance-sources";

export const CLEARANCE_ITEM_ACTIONS = ["clear", "flag", "waive", "not_applicable", "reopen"] as const;
export type ClearanceItemAction = (typeof CLEARANCE_ITEM_ACTIONS)[number];

export const openClearanceSchema = z.object({
  organizationId: z.string().trim().min(1),
  employeeId: objectIdSchema("Select an employee"),
  separationTypeCode: z.string().trim().min(1, "Select a separation type"),
  noticeDate: calendarDateSchema,
  lastWorkingDay: calendarDateSchema,
  // How the notice arrived, e.g. "Resignation letter by email, 28 Sep 2026".
  noticeReference: z.string().trim().max(200).optional(),
  remarks: z.string().trim().max(1000).optional(),
});

export const clearanceItemActionSchema = z.object({
  organizationId: z.string().trim().min(1),
  action: z.enum(CLEARANCE_ITEM_ACTIONS),
  note: z.string().trim().max(500).optional(),
  amount: z.number().min(0).max(100_000_000).optional(),
});

export const cancelClearanceSchema = z.object({
  organizationId: z.string().trim().min(1),
  reason: z.string().trim().max(500),
});

export const createChecklistItemSchema = z.object({
  organizationId: z.string().trim().min(1),
  departmentCode: z.string().trim().min(1, "Select a department"),
  title: z.string().trim().min(1, "Enter what must be cleared").max(120),
  description: z.string().trim().max(500).optional(),
  blocking: z.boolean(),
  dueDaysAfterLastDay: z.number().int().min(0).max(60),
  autoSource: z.enum(CLEARANCE_AUTO_SOURCES).optional(),
});

export const updateChecklistItemSchema = z.object({
  organizationId: z.string().trim().min(1),
  status: z.enum(["active", "inactive"]).optional(),
  departmentCode: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  blocking: z.boolean().optional(),
  dueDaysAfterLastDay: z.number().int().min(0).max(60).optional(),
});

export type OpenClearanceInput = z.infer<typeof openClearanceSchema>;
export type ClearanceItemActionInput = Omit<z.infer<typeof clearanceItemActionSchema>, "organizationId">;
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemSchema>;
export type UpdateChecklistItemInput = Omit<z.infer<typeof updateChecklistItemSchema>, "organizationId" | "status">;
