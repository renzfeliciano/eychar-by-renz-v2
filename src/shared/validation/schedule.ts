import { z } from "zod";
import { clearable, objectIdSchema } from "./shared";

export const SHIFT_KINDS = ["work", "rest"] as const;
export type ShiftKind = (typeof SHIFT_KINDS)[number];

/** Rows × days in one save. 31 days × ~200 employees — a full month for a large site. */
export const MAX_SCHEDULE_ENTRIES_PER_SAVE = 6200;

const timeSchema = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm, e.g. 08:00");
const shiftCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{1,6}$/, "Code must be 1–6 letters, numbers or dashes, e.g. D or N2")
  .transform((code) => code.toUpperCase());

export const monthSchema = z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-10");
export const calendarDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Use a date like 2026-10-05")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }, "That date doesn't exist");

/** Days from one YYYY-MM-DD key to another, counting both ends ("2026-10-01" to "2026-10-31" is 31). */
export function dateSpanInDays(from: string, to: string): number {
  const toUtc = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000) + 1;
}

export const createShiftTemplateSchema = z.object({
  organizationId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(60),
  code: shiftCodeSchema,
  kind: z.enum(SHIFT_KINDS),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
});

// Pre-filled edit form; "" clears a time (needed when switching a shift to a rest day).
export const updateShiftTemplateSchema = z.object({
  organizationId: z.string().trim().min(1),
  status: z.enum(["active", "inactive"]).optional(),
  name: z.string().trim().min(1).max(60).optional(),
  code: shiftCodeSchema.optional(),
  kind: z.enum(SHIFT_KINDS).optional(),
  startTime: clearable(timeSchema).optional(),
  endTime: clearable(timeSchema).optional(),
});

export const scheduleEntryInputSchema = z.object({
  employeeId: objectIdSchema("Select a valid employee"),
  date: calendarDateSchema,
  // null clears that day back to unscheduled.
  shiftTemplateId: objectIdSchema("Select a valid shift").nullable(),
  projectId: objectIdSchema("Select a valid project").optional(),
});

export const saveScheduleEntriesSchema = z.object({
  organizationId: z.string().trim().min(1),
  entries: z.array(scheduleEntryInputSchema).min(1, "Select at least one day").max(MAX_SCHEDULE_ENTRIES_PER_SAVE),
});

export const scheduleExportQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  month: monthSchema,
  format: z.enum(["xlsx", "csv"]),
});

export type CreateShiftTemplateInput = z.infer<typeof createShiftTemplateSchema>;
export type UpdateShiftTemplateInput = z.infer<typeof updateShiftTemplateSchema>;
export type ScheduleEntryInput = z.infer<typeof scheduleEntryInputSchema>;
